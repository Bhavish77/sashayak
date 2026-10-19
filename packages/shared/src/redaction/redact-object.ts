import { redactText } from './redact-text';

/**
 * Keys whose value is always replaced outright, regardless of whether it
 * matches a personal-data pattern — CLAUDE.md: "Never log message text,
 * PINs, tokens or secrets." A password or PIN doesn't look like a phone
 * number or an email, so pattern matching alone would miss it.
 */
const ALWAYS_REDACT_KEYS = new Set([
  'password',
  'password_hash',
  'pin',
  'pin_hash',
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'otp',
  'authorization',
]);

/** F06: deep, key-aware redaction for anything logged, traced or stored (`llm_calls`, `messages.content`, tool inputs, audit details). */
export function redactObject(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactText(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactObject);
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, fieldValue] of Object.entries(value)) {
      result[key] = ALWAYS_REDACT_KEYS.has(key.toLowerCase())
        ? '[REDACTED]'
        : redactObject(fieldValue);
    }
    return result;
  }
  return value;
}
