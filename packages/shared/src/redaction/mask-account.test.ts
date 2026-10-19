import { describe, expect, it } from 'vitest';
import { maskAccount } from './mask-account';

describe('maskAccount', () => {
  it('keeps the last 4 characters and masks the rest with exactly 4 Xs', () => {
    expect(maskAccount('1234567890')).toBe('XXXX7890');
  });

  it('matches the example in F06 exactly', () => {
    expect(maskAccount('00001234')).toBe('XXXX1234');
  });

  it('is idempotent: masking an already-masked value returns the same value', () => {
    const once = maskAccount('1234567890');
    expect(maskAccount(once)).toBe(once);
  });

  it('never throws on a short input', () => {
    expect(() => maskAccount('12')).not.toThrow();
  });

  it('never throws on an empty string', () => {
    expect(() => maskAccount('')).not.toThrow();
  });
});
