import { describe, expect, it } from 'vitest';
import { enterRequestContext, getRequestContext, runWithRequestContext } from './request-context';

describe('request context (AsyncLocalStorage)', () => {
  it('returns undefined outside any request context', () => {
    expect(getRequestContext()).toBeUndefined();
  });

  it('returns the context while inside runWithRequestContext', () => {
    runWithRequestContext({ requestId: 'req-1' }, () => {
      expect(getRequestContext()).toEqual({ requestId: 'req-1' });
    });
  });

  it('carries the context across an await inside the same async call tree', async () => {
    const seen: Array<string | undefined> = [];
    await runWithRequestContext({ requestId: 'req-2' }, async () => {
      seen.push(getRequestContext()?.requestId);
      await new Promise((resolve) => setTimeout(resolve, 0));
      seen.push(getRequestContext()?.requestId);
    });
    expect(seen).toEqual(['req-2', 'req-2']);
  });

  it('does not leak one request context into a sibling call', () => {
    runWithRequestContext({ requestId: 'req-a' }, () => {
      expect(getRequestContext()?.requestId).toBe('req-a');
    });
    runWithRequestContext({ requestId: 'req-b' }, () => {
      expect(getRequestContext()?.requestId).toBe('req-b');
    });
  });

  it('returns to undefined after the context exits', () => {
    runWithRequestContext({ requestId: 'req-3' }, () => undefined);
    expect(getRequestContext()).toBeUndefined();
  });

  it('enterRequestContext sets the context for the rest of the current async chain, no wrapping callback needed', async () => {
    // Fastify's hook lifecycle is a sequence of separate hook invocations,
    // not one callback that wraps the whole request — this is why the
    // entry point into an app framework needs `enterWith`, not `run`.
    // The outer `runWithRequestContext` here is just this test's own
    // cleanup boundary (`run()` always restores the prior store once its
    // callback settles, even if that callback called `enterWith` partway
    // through) — it is not what the assertion is about.
    await runWithRequestContext({ requestId: 'outer' }, async () => {
      async function simulateOnRequestHook() {
        enterRequestContext({ requestId: 'req-entered' });
      }
      async function simulateLaterHandler() {
        return getRequestContext()?.requestId;
      }

      await simulateOnRequestHook();
      const seenInHandler = await simulateLaterHandler();
      expect(seenInHandler).toBe('req-entered');
    });

    expect(getRequestContext()).toBeUndefined();
  });
});
