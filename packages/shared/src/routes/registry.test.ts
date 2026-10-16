import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { createRouteFake, definePublicRoute, defineInternalRoute } from './registry';

const exampleRoute = definePublicRoute({
  method: 'POST',
  path: '/v1/example',
  roles: 'public',
  request: z.object({ amount_minor: z.number().int().positive() }).strict(),
  response: z.object({ ok: z.boolean() }).strict(),
});

describe('definePublicRoute / defineInternalRoute', () => {
  it('returns the definition unchanged (the helpers are for type inference, not transformation)', () => {
    expect(exampleRoute.method).toBe('POST');
    expect(exampleRoute.path).toBe('/v1/example');
    expect(exampleRoute.roles).toBe('public');
  });

  it('defineInternalRoute requires callee and callers', () => {
    const route = defineInternalRoute({
      method: 'GET',
      path: '/internal/v1/example',
      callee: 'wallet',
      callers: ['transfers'],
      request: z.object({}).strict(),
      response: z.object({ ok: z.boolean() }).strict(),
    });
    expect(route.callee).toBe('wallet');
    expect(route.callers).toEqual(['transfers']);
  });
});

describe('createRouteFake', () => {
  it('validates input, calls the handler, and validates the output', async () => {
    const fake = createRouteFake(exampleRoute, (input) => ({ ok: input.amount_minor > 0 }));
    await expect(fake({ amount_minor: 500 })).resolves.toEqual({ ok: true });
  });

  it('rejects input that fails the request schema (consumer-style)', async () => {
    const fake = createRouteFake(exampleRoute, (input) => ({ ok: input.amount_minor > 0 }));
    await expect(fake({ amount_minor: -5 })).rejects.toThrow();
  });

  it('rejects a handler whose output fails the response schema (provider-style)', async () => {
    // @ts-expect-error deliberately wrong-shaped handler output, to prove the fake
    // actually validates what the handler returns rather than trusting it.
    const fake = createRouteFake(exampleRoute, () => ({ ok: 'not-a-boolean' }));
    await expect(fake({ amount_minor: 500 })).rejects.toThrow();
  });

  it('a mutated response schema makes a previously-valid handler fail (AC-F10-7)', async () => {
    const goodHandler = (input: { amount_minor: number }) => ({ ok: input.amount_minor > 0 });
    const original = createRouteFake(exampleRoute, goodHandler);
    await expect(original({ amount_minor: 500 })).resolves.toEqual({ ok: true });

    // Cast to the pre-mutation type: this simulates the real AC-F10-7
    // scenario, where a route's live schema changes but a caller's
    // already-compiled code still reflects the old contract.
    const mutated = {
      ...exampleRoute,
      response: z.object({ ok: z.boolean(), extra_required_field: z.string() }).strict(),
    } as typeof exampleRoute;
    const afterMutation = createRouteFake(mutated, goodHandler);
    await expect(afterMutation({ amount_minor: 500 })).rejects.toThrow();
  });

  it('a mutated request schema makes a previously-valid caller fail (AC-F10-7)', async () => {
    const goodHandler = (input: { amount_minor: number }) => ({ ok: input.amount_minor > 0 });
    const mutated = {
      ...exampleRoute,
      request: z
        .object({ amount_minor: z.number().int().positive(), currency: z.literal('INR') })
        .strict(),
    } as typeof exampleRoute;
    const afterMutation = createRouteFake(mutated, goodHandler);
    // The same input that satisfied the original request schema no longer does.
    await expect(afterMutation({ amount_minor: 500 })).rejects.toThrow();
  });
});
