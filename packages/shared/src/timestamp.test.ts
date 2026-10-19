import { describe, expect, it } from 'vitest';
import { isoTimestampSchema } from './timestamp';

describe('isoTimestampSchema', () => {
  it('accepts a UTC timestamp with exactly three fractional digits', () => {
    expect(isoTimestampSchema.parse('2026-10-14T10:00:00.000Z')).toBe('2026-10-14T10:00:00.000Z');
  });

  it('rejects a timestamp with no fractional digits', () => {
    expect(() => isoTimestampSchema.parse('2026-10-14T10:00:00Z')).toThrow();
  });

  it('rejects a timestamp with six fractional digits', () => {
    expect(() => isoTimestampSchema.parse('2026-10-14T10:00:00.123456Z')).toThrow();
  });

  it('rejects an offset instead of Z', () => {
    expect(() => isoTimestampSchema.parse('2026-10-14T10:00:00.000+05:30')).toThrow();
  });

  it('rejects a date-only string', () => {
    expect(() => isoTimestampSchema.parse('2026-10-14')).toThrow();
  });

  it('rejects a lowercase z', () => {
    expect(() => isoTimestampSchema.parse('2026-10-14T10:00:00.000z')).toThrow();
  });
});
