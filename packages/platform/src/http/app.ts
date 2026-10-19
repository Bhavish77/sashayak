import { randomUUID } from 'node:crypto';
import { AppError } from '@sahayak/shared';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Logger } from 'pino';
import { enterRequestContext } from '../logging/request-context';
import { mapErrorToProblemJson } from './errors';

/** API.md/F06: request body over this size is `413 PAYLOAD_TOO_LARGE`, enforced in every service. */
const DEFAULT_BODY_LIMIT_BYTES = 16 * 1024;

export interface CreateAppsOptions {
  /** The service's own logger (T06) — every request's log lines go through it, redaction included. */
  logger: Logger;
  /** Origins the public listener's CORS grants a response to; the internal listener never sets CORS headers at all. */
  corsAllowedOrigins: string[];
  bodyLimitBytes?: number;
}

/** The app type carries the concrete `pino.Logger` generic (from `loggerInstance`), not Fastify's default base logger type. */
export type AppInstance = ReturnType<typeof buildBaseApp>;

export interface Apps {
  /** Reachable from outside (through `edge`'s routing, or directly for `edge` itself): security headers, CORS, public routes. */
  publicApp: AppInstance;
  /** Service-to-service and health/readiness/metrics only; no CORS headers, never routed by the proxy (ADR-018). */
  internalApp: AppInstance;
}

/**
 * Builds the two Fastify instances every service starts (ARCHITECTURE
 * section 9, F10): identical request handling (Zod validation, the F06
 * redacting logger, problem+json error mapping, the 16 KB body limit)
 * except that only the public one carries security headers and CORS —
 * the internal one is private-network-only and must never answer a
 * browser's CORS preflight at all.
 */
export async function createApps(options: CreateAppsOptions): Promise<Apps> {
  const publicApp = buildBaseApp(options);
  await publicApp.register(helmet);
  await publicApp.register(cors, { origin: options.corsAllowedOrigins });

  const internalApp = buildBaseApp(options);

  return { publicApp, internalApp };
}

function buildBaseApp(options: CreateAppsOptions) {
  const app = Fastify({
    loggerInstance: options.logger,
    bodyLimit: options.bodyLimitBytes ?? DEFAULT_BODY_LIMIT_BYTES,
    genReqId: (request) => {
      const header = request.headers['x-request-id'];
      return typeof header === 'string' && header.length > 0 ? header : randomUUID();
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // The earliest hook: every later hook, the handler, and any log call
  // made anywhere in between reads the request id (and trace id, if
  // present) back from AsyncLocalStorage, never threaded through
  // function signatures by hand (T06).
  app.addHook('onRequest', async (request) => {
    const traceparent = request.headers.traceparent;
    enterRequestContext({
      requestId: request.id,
      traceId: typeof traceparent === 'string' ? traceparent : undefined,
    });
  });

  app.setErrorHandler((error, request, reply) => {
    const body = mapErrorToProblemJson(error, request.id);
    reply.code(body.status).type('application/problem+json').send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    const body = mapErrorToProblemJson(new AppError('NOT_FOUND', 'Route not found'), request.id);
    reply.code(404).type('application/problem+json').send(body);
  });

  return app;
}
