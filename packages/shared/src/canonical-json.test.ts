import { describe, expect, it } from 'vitest';
import { CANONICAL_JSON_VECTORS, canonicalJson } from './canonical-json';

describe('canonicalJson', () => {
  it.each(CANONICAL_JSON_VECTORS.map((v) => [v.description, v.input, v.expected] as const))(
    '%s',
    (_description, input, expected) => {
      expect(canonicalJson(input)).toBe(expected);
    },
  );

  it('produces the same output regardless of key insertion order (AC-F07-3)', () => {
    const insertedAsBA = { b: 2, a: 1 };
    const insertedAsAB = { a: 1, b: 2 };
    expect(canonicalJson(insertedAsBA)).toBe(canonicalJson(insertedAsAB));
  });

  it('is deterministic: the same entry always yields the same output', () => {
    const entry = { actor_id: 'u1', action: 'auth.login.success', amount_minor: 50000 };
    expect(canonicalJson(entry)).toBe(canonicalJson({ ...entry }));
  });
});
