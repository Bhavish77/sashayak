import { redactText } from './redact-text';

/**
 * Words that mark a key as sensitive wherever they appear as a whole
 * word (not a substring — "monkey" must not match "key"). A key is split
 * into words on `_`, `-`, `.` and camelCase boundaries before checking,
 * so `refreshToken`, `x-service-token` and `access_token` are all caught
 * by the same "token" entry.
 */
const SENSITIVE_WORDS = new Set([
  'password',
  'passwd',
  'pin',
  'token',
  'secret',
  'otp',
  'authorization',
  'cookie',
  'credential',
  'credentials',
  'assertion',
]);

/**
 * "key" alone is too common a word to always redact (`idempotency_key`,
 * `snapshot_hash` must survive) — it's only sensitive when it directly
 * follows one of these words, as in `api_key`, `private_key`, `x-api-key`.
 */
const KEY_PRECEDING_WORDS = new Set(['api', 'private', 'secret']);

const MAX_DEPTH = 20;

function splitKeyIntoWords(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .split(/[_\-.]+/)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 0);
}

function isSensitiveKey(key: string): boolean {
  const words = splitKeyIntoWords(key);
  return words.some((word, index) => {
    if (SENSITIVE_WORDS.has(word)) {
      return true;
    }
    const previousWord = words[index - 1];
    return word === 'key' && previousWord !== undefined && KEY_PRECEDING_WORDS.has(previousWord);
  });
}

/**
 * F06: deep, key-aware redaction for anything logged, traced or stored
 * (`llm_calls`, `messages.content`, tool inputs, audit details).
 *
 * `ancestors` tracks objects currently being recursed into (added before
 * recursing into their children, removed right after), so a true cycle
 * — an object reachable from itself — is told apart from the same
 * object merely appearing twice as unrelated siblings, which is not a
 * cycle and must still be redacted normally both times.
 */
export function redactObject(value: unknown): unknown {
  return redactValue(value, new Set(), 0);
}

function redactValue(value: unknown, ancestors: Set<object>, depth: number): unknown {
  if (typeof value === 'string') {
    return redactText(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Error) {
    return { name: value.name, message: redactText(value.message) };
  }
  if (value !== null && typeof value === 'object') {
    if (ancestors.has(value)) {
      return '[Circular]';
    }
    if (depth > MAX_DEPTH) {
      return '[Truncated]';
    }
    ancestors.add(value);
    const result = Array.isArray(value)
      ? value.map((item) => redactValue(item, ancestors, depth + 1))
      : Object.fromEntries(
          Object.entries(value).map(([key, fieldValue]) => [
            key,
            isSensitiveKey(key) ? '[REDACTED]' : redactValue(fieldValue, ancestors, depth + 1),
          ]),
        );
    ancestors.delete(value);
    return result;
  }
  return value;
}
