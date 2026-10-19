import { AppError } from '@sahayak/shared';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../logging/logger';
import { createMemorySink } from '../logging/memory-sink';
import { createApps } from './app';

function buildTestApps(corsAllowedOrigins: string[] = ['https://app.example.com']) {
  const sink = createMemorySink();
  const logger = createLogger({ serviceName: 'edge', destination: sink.stream });
  return { appsPromise: createApps({ logger, corsAllowedOrigins }), sink };
}

describe('createApps: error mapping (app.inject)', () => {
  it('returns problem+json with a request id for a thrown AppError', async () => {
    const { appsPromise } = buildTestApps();
    const { publicApp } = await appsPromise;
    publicApp.get('/boom', async () => {
      throw new AppError('NOT_FOUND', 'Transfer not found');
    });
    const response = await publicApp.inject({ method: 'GET', url: '/boom' });
    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
    const body = response.json();
    expect(body.code).toBe('NOT_FOUND');
    expect(body.request_id).toBeTruthy();
  });

  it('returns a 404 problem body for an unknown route', async () => {
    const { appsPromise } = buildTestApps();
    const { publicApp } = await appsPromise;
    const response = await publicApp.inject({ method: 'GET', url: '/does-not-exist' });
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('NOT_FOUND');
  });

  it('returns 413 for a body over the 16 KB limit', async () => {
    const { appsPromise } = buildTestApps();
    const { publicApp } = await appsPromise;
    publicApp.post('/echo', async (request) => request.body);
    const response = await publicApp.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ big: 'x'.repeat(20_000) }),
    });
    expect(response.statusCode).toBe(413);
    expect(response.json().code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('returns INTERNAL without stack, SQL or file path for an unexpected exception (AC-F06-12)', async () => {
    const { appsPromise } = buildTestApps();
    const { publicApp } = await appsPromise;
    publicApp.get('/explode', async () => {
      throw new Error('leaked at /var/www/app.js near SELECT * FROM users WHERE token=abc');
    });
    const response = await publicApp.inject({ method: 'GET', url: '/explode' });
    expect(response.statusCode).toBe(500);
    expect(response.payload).not.toContain('SELECT');
    expect(response.payload).not.toContain('/var/www');
    expect(response.payload).not.toContain('app.js');
    expect(response.json().code).toBe('INTERNAL');
  });
});

describe('createApps: security headers and CORS', () => {
  it('sets security headers on the public listener', async () => {
    const { appsPromise } = buildTestApps();
    const { publicApp } = await appsPromise;
    publicApp.get('/ping', async () => ({ ok: true }));
    const response = await publicApp.inject({ method: 'GET', url: '/ping' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-dns-prefetch-control']).toBeDefined();
  });

  it('grants CORS only to an allowlisted origin on the public listener', async () => {
    const { appsPromise } = buildTestApps(['https://app.example.com']);
    const { publicApp } = await appsPromise;
    publicApp.get('/ping', async () => ({ ok: true }));

    const allowed = await publicApp.inject({
      method: 'GET',
      url: '/ping',
      headers: { origin: 'https://app.example.com' },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('https://app.example.com');

    const denied = await publicApp.inject({
      method: 'GET',
      url: '/ping',
      headers: { origin: 'https://evil.example.com' },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sends no CORS headers at all on the internal listener', async () => {
    const { appsPromise } = buildTestApps(['https://app.example.com']);
    const { internalApp } = await appsPromise;
    internalApp.get('/ping', async () => ({ ok: true }));
    const response = await internalApp.inject({
      method: 'GET',
      url: '/ping',
      headers: { origin: 'https://app.example.com' },
    });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('createApps: request id flows into the logger via request context', () => {
  it('a log call made inside a route handler carries the inbound X-Request-Id', async () => {
    const { appsPromise, sink } = buildTestApps([]);
    const { publicApp } = await appsPromise;
    publicApp.get('/log-me', async (request) => {
      request.log.info('handled inside a route');
      return { ok: true };
    });
    const response = await publicApp.inject({
      method: 'GET',
      url: '/log-me',
      headers: { 'x-request-id': 'req-from-test' },
    });
    expect(response.statusCode).toBe(200);
    const record = sink.records.find((entry) => entry.msg === 'handled inside a route');
    expect(record?.request_id).toBe('req-from-test');
  });

  it('generates a request id when none is given, and still logs it', async () => {
    const { appsPromise, sink } = buildTestApps([]);
    const { publicApp } = await appsPromise;
    publicApp.get('/log-me', async (request) => {
      request.log.info('handled with a generated id');
      return { ok: true };
    });
    const response = await publicApp.inject({ method: 'GET', url: '/log-me' });
    expect(response.statusCode).toBe(200);
    const record = sink.records.find((entry) => entry.msg === 'handled with a generated id');
    expect(typeof record?.request_id).toBe('string');
    expect((record?.request_id as string).length).toBeGreaterThan(0);
  });
});
