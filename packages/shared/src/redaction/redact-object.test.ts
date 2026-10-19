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
