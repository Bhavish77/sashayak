import { redactObject } from './redact-object';
import { redactText } from './redact-text';

/**
 * A pino serializer: `(value) => redactedValue`, assignable to whichever
 * log field `platform`'s logger (T06) chooses — `shared` has no I/O of
 * its own, so it does not import pino or wire this up to a real logger.
 */
export function pinoRedactionSerializer(value: unknown): unknown {
  return redactObject(value);
}

/**
 * OpenTelemetry span attributes are a flat record of primitives or arrays
 * of primitives (never nested objects), so only string values (and
 * strings inside arrays) need redacting; numbers and booleans pass
 * through unchanged. Intended for `platform`'s span processor (T06+).
 */
export function redactSpanAttributes(attributes: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (typeof value === 'string') {
      result[key] = redactText(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) => (typeof item === 'string' ? redactText(item) : item));
    } else {
      result[key] = value;
    }
  }
  return result;
}
