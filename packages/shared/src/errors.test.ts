import { describe, expect, it } from 'vitest';
import { AppError, errorCodes, errorTable, errorTypeUrl, problemJsonSchema } from './errors';

describe('errorTable', () => {
  it('has exactly the public codes from API.md and internal codes from INTERNAL_API.md', () => {
    expect(new Set(errorCodes)).toEqual(
      new Set([
        // public (API.md)
        'VALIDATION_FAILED',
        'AUTH_INVALID_CREDENTIALS',
        'AUTH_TOKEN_EXPIRED',
        'AUTH_REFRESH_INVALID',
        'AUTH_FORBIDDEN',
        'NOT_FOUND',
        'IDEMPOTENCY_KEY_REQUIRED',
        'IDEMPOTENCY_KEY_REUSED',
        'IDEMPOTENCY_IN_PROGRESS',
        'TRANSFER_EXPIRED',
        'TRANSFER_NOT_CONFIRMABLE',
        'TRANSFER_NOT_RESOLVABLE',
        'TRANSFER_BUSY',
        'INSUFFICIENT_FUNDS',
        'LIMIT_EXCEEDED',
        'PIN_REQUIRED',
        'PIN_INVALID',
        'PIN_LOCKED',
        'RATE_LIMITED',
        'PAYLOAD_TOO_LARGE',
        'INTERNAL',
        'DEPENDENCY_UNAVAILABLE',
        // internal (INTERNAL_API.md)
        'SERVICE_TOKEN_INVALID',
        'SERVICE_FORBIDDEN',
        'HOLD_VOIDED',
        'HOLD_STATE_CONFLICT',
      ]),
    );
  });

  it('every code has an HTTP status, a title and a message key', () => {
    for (const code of errorCodes) {
      const entry = errorTable[code];
      expect(entry.status).toBeGreaterThanOrEqual(400);
      expect(entry.status).toBeLessThan(600);
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.messageKey).toBe(`errors.${code.toLowerCase()}`);
    }
  });

  it('matches the specific status codes named in the specs', () => {
    expect(errorTable.INSUFFICIENT_FUNDS.status).toBe(422);
    expect(errorTable.PIN_LOCKED.status).toBe(423);
    expect(errorTable.TRANSFER_BUSY.status).toBe(409);
    expect(errorTable.SERVICE_TOKEN_INVALID.status).toBe(401);
    expect(errorTable.SERVICE_FORBIDDEN.status).toBe(403);
    expect(errorTable.DEPENDENCY_UNAVAILABLE.status).toBe(503);
  });
});

describe('problemJsonSchema', () => {
  it('accepts a well-formed problem+json body', () => {
    const body = {
      type: 'https://sahayak.dev/errors/insufficient-funds',
      title: 'Insufficient funds',
      status: 422,
      code: 'INSUFFICIENT_FUNDS',
      detail: 'Available balance is lower than the transfer total.',
      request_id: '01JABCDEF0000000000000000',
      errors: [],
    };
    expect(problemJsonSchema.parse(body)).toEqual(body);
  });

  it('accepts field errors in `errors`', () => {
    const body = {
      type: 'https://sahayak.dev/errors/validation-failed',
      title: 'Validation failed',
      status: 400,
      code: 'VALIDATION_FAILED',
      detail: 'One or more fields are invalid.',
      request_id: '01JABCDEF0000000000000001',
      errors: [{ path: 'amount_minor', message: 'must be at least 100' }],
    };
    expect(problemJsonSchema.parse(body)).toEqual(body);
  });

  it('rejects a code outside the closed table', () => {
    expect(() =>
      problemJsonSchema.parse({
        type: 'https://sahayak.dev/errors/x',
        title: 'X',
        status: 400,
        code: 'NOT_A_REAL_CODE',
        detail: 'x',
        request_id: 'x',
        errors: [],
      }),
    ).toThrow();
  });

  it('rejects unknown top-level properties', () => {
    expect(() =>
      problemJsonSchema.parse({
        type: 'https://sahayak.dev/errors/x',
        title: 'X',
        status: 400,
        code: 'VALIDATION_FAILED',
        detail: 'x',
        request_id: 'x',
        errors: [],
        extra: 'nope',
      }),
    ).toThrow();
  });
});

describe('errorTypeUrl', () => {
  it('matches the API.md example for INSUFFICIENT_FUNDS', () => {
    expect(errorTypeUrl('INSUFFICIENT_FUNDS')).toBe(
      'https://sahayak.dev/errors/insufficient-funds',
    );
  });

  it('kebab-cases every code into a valid URL', () => {
    for (const code of errorCodes) {
      expect(() => new URL(errorTypeUrl(code))).not.toThrow();
    }
  });
});

describe('AppError', () => {
  it('carries the code, a detail message and no field errors by default', () => {
    const error = new AppError('NOT_FOUND', 'Transfer not found');
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.detail).toBe('Transfer not found');
    expect(error.message).toBe('Transfer not found');
    expect(error.fieldErrors).toEqual([]);
  });

  it('carries field errors for a validation failure', () => {
    const error = new AppError('VALIDATION_FAILED', 'One or more fields are invalid.', [
      { path: 'amount_minor', message: 'must be at least 100' },
    ]);
    expect(error.fieldErrors).toEqual([{ path: 'amount_minor', message: 'must be at least 100' }]);
  });

  it('builds a problem+json body that passes problemJsonSchema', () => {
    const error = new AppError('INSUFFICIENT_FUNDS', 'Available balance is lower than the total.');
    const body = error.toProblemJson('req-1');
    expect(problemJsonSchema.parse(body)).toEqual(body);
    expect(body.status).toBe(422);
    expect(body.code).toBe('INSUFFICIENT_FUNDS');
    expect(body.request_id).toBe('req-1');
  });
});
