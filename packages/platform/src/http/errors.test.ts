import { AppError } from '@sahayak/shared';
import type { ZodFastifySchemaValidationError } from 'fastify-type-provider-zod';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { mapErrorToProblemJson } from './errors';

// fastify-type-provider-zod builds its own validation-error entries with
// this exact symbol (keyed by description, so `Symbol.for` reaches the
// same registry entry regardless of which module created it) tagging
// each one — `hasZodFastifySchemaValidationErrors` checks for it at
// runtime. The package's own `createValidationError` helper that would
// normally build these isn't actually exported from its compiled JS
// (a gap in its 4.0.2 release, despite being in its .d.ts), so this
// constructs one by hand instead of depending on it.
function toZodFastifyValidationErrors(zodError: z.ZodError): ZodFastifySchemaValidationError[] {
  return zodError.errors.map(
    (issue) =>
      ({
        [Symbol.for('ZodFastifySchemaValidationError')]: true,
        keyword: issue.code,
        instancePath: `/${issue.path.join('/')}`,
        schemaPath: `#/${issue.path.join('/')}/${issue.code}`,
        params: { issue },
        message: issue.message,
      }) as unknown as ZodFastifySchemaValidationError,
  );
}

describe('mapErrorToProblemJson', () => {
  it('converts an AppError to its own problem+json body', () => {
    const error = new AppError('NOT_FOUND', 'Transfer not found');
    const body = mapErrorToProblemJson(error, 'req-1');
    expect(body.code).toBe('NOT_FOUND');
    expect(body.status).toBe(404);
    expect(body.request_id).toBe('req-1');
  });

  it('converts a Zod schema validation failure to VALIDATION_FAILED with field errors', () => {
    const zodResult = z.object({ amount_minor: z.number() }).safeParse({ amount_minor: 'x' });
    if (zodResult.success) {
      throw new Error('test setup error: expected this parse to fail');
    }
    const fastifyLikeError = Object.assign(new Error('Validation failed'), {
      validation: toZodFastifyValidationErrors(zodResult.error),
      code: 'FST_ERR_VALIDATION',
    });
    const body = mapErrorToProblemJson(fastifyLikeError, 'req-2');
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.status).toBe(400);
    expect(body.errors).toEqual([
      { path: 'amount_minor', message: expect.stringContaining('number') as unknown as string },
    ]);
  });

  it('converts a body-too-large error to PAYLOAD_TOO_LARGE', () => {
    const fastifyLikeError = Object.assign(new Error('request file too large'), {
      code: 'FST_ERR_CTP_BODY_TOO_LARGE',
    });
    const body = mapErrorToProblemJson(fastifyLikeError, 'req-3');
    expect(body.code).toBe('PAYLOAD_TOO_LARGE');
    expect(body.status).toBe(413);
  });

  it('converts an unexpected error to INTERNAL without leaking its message, stack or any property', () => {
    const unexpected = new Error('password=hunter2 at /etc/secrets.sql near SELECT * FROM users');
    const body = mapErrorToProblemJson(unexpected, 'req-4');
    expect(body.code).toBe('INTERNAL');
    expect(body.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(JSON.stringify(body)).not.toContain('secrets.sql');
    expect(JSON.stringify(body)).not.toContain('SELECT');
    expect(JSON.stringify(body)).not.toContain(unexpected.stack ?? '\u0000impossible\u0000');
  });

  it('converts a non-Error thrown value to INTERNAL without throwing itself', () => {
    expect(() => mapErrorToProblemJson('a bare string throw', 'req-5')).not.toThrow();
    const body = mapErrorToProblemJson('a bare string throw', 'req-5');
    expect(body.code).toBe('INTERNAL');
  });

  it('always sets request_id to the id given, regardless of error kind', () => {
    expect(mapErrorToProblemJson(new AppError('NOT_FOUND', 'x'), 'req-a').request_id).toBe('req-a');
    expect(mapErrorToProblemJson(new Error('x'), 'req-b').request_id).toBe('req-b');
  });
});
