import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The per-request facts every log line should carry (ARCHITECTURE
 * section 9, F09). `traceId` is optional because not every call path
 * (a background job, a one-off script) runs inside a trace.
 */
export interface RequestContext {
  requestId: string;
  traceId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Runs `fn` with `context` attached for the lifetime of its call tree —
 * AsyncLocalStorage carries it across `await`, so every log call made
 * anywhere inside, synchronous or not, can read it back without the
 * caller threading a request id through every function signature.
 */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** `undefined` outside any `runWithRequestContext` call. */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
