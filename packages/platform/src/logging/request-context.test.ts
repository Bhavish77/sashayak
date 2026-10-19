import { describe, expect, it } from 'vitest';
import { getRequestContext, runWithRequestContext } from './request-context';

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
});
