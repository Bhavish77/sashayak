import { definePublicRoute } from '@sahayak/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createLogger } from '../logging/logger';
import { createMemorySink } from '../logging/memory-sink';
import { createApps } from './app';
import { registerRoute } from './register-route';

async function buildTestApp() {
  const sink = createMemorySink();
  const logger = createLogger({ serviceName: 'edge', destination: sink.stream });
  const { publicApp } = await createApps({ logger, corsAllowedOrigins: [] });
  return publicApp;
}

const getItemRoute = definePublicRoute({
  method: 'GET',
  path: '/v1/items/:id',
  roles: 'public',
  request: z.object({ id: z.string(), verbose: z.string().optional() }).strict(),
  response: z.object({ id: z.string(), verbose: z.string().optional() }).strict(),
});

const updateItemRoute = definePublicRoute({
  method: 'POST',
  path: '/v1/items/:id',
  roles: 'public',
  request: z.object({ id: z.string(), label: z.string() }).strict(),
  response: z.object({ ok: z.boolean() }).strict(),
});

describe('registerRoute: request assembly (AC-F10-19)', () => {
  it('merges path params and query into one object and passes it to the handler', async () => {
    const app = await buildTestApp();
    registerRoute(app, getItemRoute, { ownership: false }, async (input) => input);
    const response = await app.inject({ method: 'GET', url: '/v1/items/abc?verbose=yes' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: 'abc', verbose: 'yes' });
  });

  it('merges path params and body into one object for a POST route', async () => {
    const app = await buildTestApp();
    registerRoute(app, updateItemRoute, { ownership: false }, async (input) => ({
      ok: input.id === 'abc' && input.label === 'new-label',
    }));
    const response = await app.inject({
      method: 'POST',
      url: '/v1/items/abc',
      payload: { label: 'new-label' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it('rejects with VALIDATION_FAILED, before the handler runs, when a key is repeated across path and body', async () => {
    const app = await buildTestApp();
    let handlerCalled = false;
    registerRoute(app, updateItemRoute, { ownership: false }, async (input) => {
      handlerCalled = true;
      return { ok: true, input };
    });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/items/abc',
      // "id" repeated: once from the path, once in the body.
      payload: { id: 'different-id', label: 'new-label' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('VALIDATION_FAILED');
    expect(handlerCalled).toBe(false);
  });

  it('rejects with VALIDATION_FAILED, before the handler runs, for an unknown key not in the schema', async () => {
    const app = await buildTestApp();
    let handlerCalled = false;
    registerRoute(app, updateItemRoute, { ownership: false }, async (input) => {
      handlerCalled = true;
      return { ok: true, input };
    });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/items/abc',
      payload: { label: 'new-label', unexpected_extra_field: 'nope' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('VALIDATION_FAILED');
    expect(handlerCalled).toBe(false);
  });
});

describe('registerRoute: policy required at registration (AC-F10-4, part)', () => {
  it('throws immediately when roles is missing from the route definition', async () => {
    const app = await buildTestApp();
    const routeWithoutRoles = {
      ...getItemRoute,
      roles: undefined,
    } as unknown as typeof getItemRoute;
    expect(() =>
      registerRoute(app, routeWithoutRoles, { ownership: false }, async (input) => input),
    ).toThrow();
  });

  it('throws immediately when ownership is not an explicit boolean', async () => {
    const app = await buildTestApp();
    expect(() =>
      registerRoute(
        app,
        getItemRoute,
        { ownership: undefined as unknown as boolean },
        async (input) => input,
      ),
    ).toThrow();
  });
});
