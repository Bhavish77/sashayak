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

  // Regression: a plain `sorted[key] = value` assignment treats a key
  // literally named "__proto__" as a prototype setter, not a normal
  // property, so it silently vanished from the output instead of being
  // hashed like any other piece of data.
  it('keeps a __proto__ key as an own, hashed data property', () => {
    const value = JSON.parse('{"b":2,"__proto__":{"x":1}}') as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(value, '__proto__')).toBe(true);

    const canonical = canonicalJson(value);
    expect(canonical).toContain('__proto__');
    expect(canonical).toBe('{"__proto__":{"x":1},"b":2}');
  });

  it('a __proto__ key makes the canonical output (and so the hash) differ from the same object without it', () => {
    const withProto = JSON.parse('{"b":2,"__proto__":{"x":1}}') as Record<string, unknown>;
    const withoutProto = { b: 2 };
    expect(canonicalJson(withProto)).not.toBe(canonicalJson(withoutProto));
  });

  it.each([
    ['top-level NaN', NaN],
    ['top-level Infinity', Infinity],
    ['top-level -Infinity', -Infinity],
    ['nested in an object', { amount_minor: NaN }],
    ['nested in an array', [1, Infinity, 2]],
    ['nested two levels deep', { a: { b: [NaN] } }],
  ])('throws instead of silently becoming null: %s', (_description, input) => {
    expect(() => canonicalJson(input)).toThrow();
  });
});
