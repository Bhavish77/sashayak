import { describe, expect, it } from 'vitest';
import { redactObject } from './redact-object';

describe('redactObject', () => {
  it('redacts a sensitive pattern found in a string value, at any depth', () => {
    const input = {
      user: { email: 'aarav@example.com', profile: { phone: '9876543210' } },
    };
    const result = redactObject(input) as typeof input;
    expect(result.user.email).toBe('[EMAIL]');
    expect(result.user.profile.phone).toBe('[PHONE]');
  });

  it('redacts sensitive patterns inside array elements', () => {
    const input = { notes: ['call 9876543210 please', 'all good'] };
    const result = redactObject(input) as typeof input;
    expect(result.notes[0]).toContain('[PHONE]');
    expect(result.notes[1]).toBe('all good');
  });

  it.each(['password', 'pin', 'token', 'secret', 'access_token', 'refresh_token', 'otp'])(
    'always redacts the value of a "%s" key, regardless of its content',
    (key) => {
      const input = { [key]: 'not-a-recognizable-pattern' };
      const result = redactObject(input) as Record<string, unknown>;
      expect(result[key]).toBe('[REDACTED]');
    },
  );

  it('key matching is case-insensitive', () => {
    const result = redactObject({ PIN: '1234' }) as Record<string, unknown>;
    expect(result.PIN).toBe('[REDACTED]');
  });

  it('leaves non-string primitives untouched', () => {
    const input = { amount_minor: 50000, active: true, note: null, missing: undefined };
    expect(redactObject(input)).toEqual(input);
  });

  it('leaves a string with no sensitive pattern untouched', () => {
    expect(redactObject({ status: 'COMPLETED' })).toEqual({ status: 'COMPLETED' });
  });

  it('never throws on an empty object or array', () => {
    expect(() => redactObject({})).not.toThrow();
    expect(() => redactObject([])).not.toThrow();
  });
});

describe('redactObject: structural edge cases (F06)', () => {
  it('converts a Date to its ISO string', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    const result = redactObject({ createdAt: date }) as Record<string, unknown>;
    expect(result.createdAt).toBe(date.toISOString());
  });

  it('converts an invalid Date to null', () => {
    const result = redactObject({ createdAt: new Date('not-a-real-date') }) as Record<
      string,
      unknown
    >;
    expect(result.createdAt).toBeNull();
  });

  it('converts an Error to a redacted { name, message } object', () => {
    const error = new Error('failed for user aarav@example.com');
    const result = redactObject({ err: error }) as { err: { name: string; message: string } };
    expect(result.err).toEqual({ name: 'Error', message: 'failed for user [EMAIL]' });
  });

  it('replaces a circular reference with "[Circular]" and does not throw', () => {
    const input: Record<string, unknown> = { name: 'loop' };
    input.self = input;
    let result: Record<string, unknown> | undefined;
    expect(() => {
      result = redactObject(input) as Record<string, unknown>;
    }).not.toThrow();
    expect(result?.self).toBe('[Circular]');
    expect(result?.name).toBe('loop');
  });

  it('fails closed to the string "[REDACTION_FAILED]" when a property getter throws, never returning the original value', () => {
    const poisoned: Record<string, unknown> = { safe: 'ok' };
    Object.defineProperty(poisoned, 'bad', {
      enumerable: true,
      get() {
        throw new Error('boom');
      },
    });
    let result: unknown;
    expect(() => {
      result = redactObject(poisoned);
    }).not.toThrow();
    expect(result).toBe('[REDACTION_FAILED]');
  });

  it('fails closed when a throwing getter is nested inside an array inside an object', () => {
    const poisoned: Record<string, unknown> = {};
    Object.defineProperty(poisoned, 'bad', {
      enumerable: true,
      get() {
        throw new Error('boom');
      },
    });
    const input = { items: [1, 2, poisoned] };
    let result: unknown;
    expect(() => {
      result = redactObject(input);
    }).not.toThrow();
    expect(result).toBe('[REDACTION_FAILED]');
  });

  it('does not flag the same object appearing twice as siblings (not a cycle) as circular', () => {
    const shared = { label: 'shared' };
    const input = { a: shared, b: shared };
    const result = redactObject(input) as Record<string, unknown>;
    expect(result.a).toEqual({ label: 'shared' });
    expect(result.b).toEqual({ label: 'shared' });
  });

  it('truncates nesting deeper than 20 levels', () => {
    let deep: Record<string, unknown> = { leaf: 'call 9876543210 now' };
    for (let i = 0; i < 25; i++) {
      deep = { child: deep };
    }
    const result = redactObject(deep) as Record<string, unknown>;
    let cursor: unknown = result;
    let hops = 0;
    while (
      typeof cursor === 'object' &&
      cursor !== null &&
      'child' in (cursor as Record<string, unknown>)
    ) {
      cursor = (cursor as Record<string, unknown>).child;
      hops++;
    }
    expect(cursor).toBe('[Truncated]');
    // Sanity: truncation must kick in somewhere inside the 25-level input,
    // not immediately at the root and not only past the very last level.
    expect(hops).toBeGreaterThan(19);
    expect(hops).toBeLessThanOrEqual(21);
  });

  it('keeps a literal "__proto__" key as plain data, not a prototype mutation', () => {
    const input = JSON.parse('{"a":1,"__proto__":{"x":"1"}}') as Record<string, unknown>;
    const result = redactObject(input) as Record<string, unknown>;
    const descriptor = Object.getOwnPropertyDescriptor(result, '__proto__');
    expect(descriptor?.value).toEqual({ x: '1' });
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(result.a).toBe(1);
  });
});

describe('redactObject: word-based sensitive key matching (F06)', () => {
  it.each([
    'password',
    'password_hash',
    'pin',
    'new_pin',
    'pin_hash',
    'token',
    'access_token',
    'refreshToken',
    'x-service-token',
    'secret',
    'client_secret',
    'otp',
    'Authorization',
    'Cookie',
    'Set-Cookie',
    'api_key',
    'apiKey',
    'x-api-key',
    'private_key',
    'step_up_assertion',
    'passcode',
    'user_passphrase',
    'db_pwd',
    'cvv',
    'card_cvc',
  ])('redacts the value of a secret-shaped key "%s"', (key) => {
    const result = redactObject({ [key]: 'some-value' }) as Record<string, unknown>;
    expect(result[key]).toBe('[REDACTED]');
  });

  it.each([
    'shipping_address_label',
    'monkey',
    'idempotency_key',
    'snapshot_hash',
    'request_id',
    'mapping',
  ])('does not redact a non-secret-shaped key "%s"', (key) => {
    const result = redactObject({ [key]: 'some-value' }) as Record<string, unknown>;
    expect(result[key]).toBe('some-value');
  });
});
