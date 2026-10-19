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

/**
 * Sets `context` for the rest of the current async chain, with no
 * wrapping callback. A web framework's request lifecycle is a sequence
 * of separate hook invocations, not one function whose call tree spans
 * the whole request, so there is no single place to pass to
 * `runWithRequestContext`; the framework's earliest hook calls this once
 * per request instead, and the context then reaches every later hook
 * and the handler, the same way `runWithRequestContext` reaches
 * everything nested inside it.
 */
export function enterRequestContext(context: RequestContext): void {
  storage.enterWith(context);
}
