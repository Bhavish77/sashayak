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
 * Every service's logger (ARCHITECTURE section 9, F09): JSON lines with
 * `service`, the current request id and trace id (read from
 * AsyncLocalStorage, never passed by the caller), and the F06 redaction
 * serializer applied to every merge object and every plain message — so
 * a call site cannot forget to redact, because the logger does it for
 * every call, not just the ones a developer remembered to guard.
 */
export function createLogger(options: CreateLoggerOptions): pino.Logger {
  return pino(
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

          if (typeof first === 'string') {
            return method.apply(this, [contextFields, redactText(first), ...rest] as Parameters<
              typeof method
            >);
          }

          const mergeObject = {
            ...(redactObject(first) as Record<string, unknown>),
            ...contextFields,
          };
          return method.apply(this, [mergeObject, ...rest] as Parameters<typeof method>);
        },
      },
    },
    options.destination,
  );
}
