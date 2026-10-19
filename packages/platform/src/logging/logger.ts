import { redactObject, redactText } from '@sahayak/shared';
import pino from 'pino';
import type { LogLevel } from '../config/schema';
import { getRequestContext } from './request-context';

export interface CreateLoggerOptions {
  serviceName: string;
  level?: LogLevel;
  /** Test seam (F09): pass `createMemorySink().stream` to capture lines in memory. */
  destination?: { write(chunk: string): boolean };
}

/**
 * Redacts a plain merge object. Returns the string `redactObject` would
 * return on failure (currently `'[REDACTION_FAILED]'`) unchanged, so the
 * caller can detect it — never an object, so the caller never spreads a
 * string into character-indexed garbage keys.
 */
function redactMergeObject(value: Record<string, unknown>): Record<string, unknown> | string {
  const redacted = redactObject(value);
  if (typeof redacted !== 'object' || redacted === null || Array.isArray(redacted)) {
    return redacted as string;
  }
  return redacted as Record<string, unknown>;
}

/** Redacts one trailing (printf or plain) argument: strings and objects only — other primitives carry no text to leak. */
function redactArgument(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactText(value);
  }
  if (value !== null && typeof value === 'object') {
    return redactObject(value);
  }
  return value;
}

/**
 * Wraps `.child()` so a child logger's own bound fields
 * (`logger.child({ phone: '...' })`) are redacted before pino stores
 * them. `formatters.bindings` looks like the documented hook for this,
 * but pino deliberately skips it for a `child(bindings)` call made
 * without a second `options` argument (an internal fast path —
 * `resetChildingsFormatter` in pino's `proto.js`), which is the common
 * call shape, so that hook alone misses exactly this case. Wrapping
 * `.child` here instead works regardless of that internal optimization,
 * and wraps every further-nested child the same way.
 */
function withRedactingChild<Logger extends pino.Logger>(logger: Logger): Logger {
  const originalChild = logger.child.bind(logger);
  logger.child = ((bindings: Record<string, unknown>, childOptions?: pino.ChildLoggerOptions) => {
    const redactedBindings = redactObject(bindings) as Record<string, unknown>;
    return withRedactingChild(originalChild(redactedBindings, childOptions));
  }) as unknown as Logger['child'];
  return logger;
}

/**
 * Every service's logger (ARCHITECTURE section 9, F09, AC-F06-15): JSON
 * lines with `service`, the current request id and trace id (read from
 * AsyncLocalStorage, never passed by the caller), and the F06 redaction
 * serializer applied to every part of every call — the message, printf
 * values, the merge object and child-logger bindings — so a call site
 * cannot forget to redact one of them, because the logger does it for
 * every call, not just the ones a developer remembered to guard.
 */
export function createLogger(options: CreateLoggerOptions): pino.Logger {
  const logger = pino(
    {
      level: options.level ?? 'info',
      base: { service: options.serviceName },
      // Pino's documented way to rename the time key: a function
      // returning a raw JSON fragment (ARCHITECTURE section 9/11 call
      // the field `ts`, not pino's default `time`).
      timestamp: () => `,"ts":"${new Date().toISOString()}"`,
      formatters: {
        level: (label) => ({ level: label }),
      },
      hooks: {
        logMethod(inputArgs, method) {
          const [first, ...rest] = inputArgs;
          const context = getRequestContext();
          const contextFields = context
            ? {
                request_id: context.requestId,
                ...(context.traceId ? { trace_id: context.traceId } : {}),
              }
            : {};
          const redactedRest = rest.map(redactArgument);

          if (first === undefined) {
            return method.apply(this, [contextFields, ...redactedRest] as Parameters<
              typeof method
            >);
          }

          if (typeof first === 'string') {
            return method.apply(this, [
              contextFields,
              redactText(first),
              ...redactedRest,
            ] as Parameters<typeof method>);
          }

          if (Array.isArray(first) || first instanceof Date) {
            const mergeObject = { ...contextFields, data: redactObject(first) };
            return method.apply(this, [mergeObject, ...redactedRest] as Parameters<typeof method>);
          }

          if (first !== null && typeof first === 'object') {
            const redacted = redactMergeObject(first as Record<string, unknown>);
            const mergeObject =
              typeof redacted === 'string'
                ? { ...contextFields, redaction_failed: true }
                : { ...redacted, ...contextFields };
            return method.apply(this, [mergeObject, ...redactedRest] as Parameters<typeof method>);
          }

          // number, boolean, bigint, null, symbol: nothing to redact.
          const mergeObject = { ...contextFields, data: first };
          return method.apply(this, [mergeObject, ...redactedRest] as Parameters<typeof method>);
        },
      },
    },
    options.destination,
  );
  return withRedactingChild(logger);
}
