/**
 * Canonical JSON (F07): keys sorted recursively, no whitespace, a `Date`
 * renders as ISO-8601 UTC with milliseconds, integers serialize without a
 * decimal point. Used by the audit writer and verifier (built in T17/T18)
 * so the same logical entry always hashes the same way regardless of key
 * order (AC-F07-3) — this module only canonicalizes; hashing is the
 * audit service's job.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export interface CanonicalJsonVector {
  readonly description: string;
  readonly input: unknown;
  readonly expected: string;
}

/** Committed test vectors (F07), reused by this module's own test and by the audit service's own tests once it lands. */
export const CANONICAL_JSON_VECTORS: readonly CanonicalJsonVector[] = [
  { description: 'sorts top-level keys', input: { b: 1, a: 2 }, expected: '{"a":2,"b":1}' },
  {
    description: 'sorts nested keys recursively',
    input: { z: { y: 1, x: 2 } },
    expected: '{"z":{"x":2,"y":1}}',
  },
  {
    description: 'arrays preserve order (only object keys are sorted)',
    input: { a: [3, 1, 2] },
    expected: '{"a":[3,1,2]}',
  },
  {
    description: 'a Date renders as ISO-8601 UTC with milliseconds',
    input: { occurred_at: new Date('2026-10-15T10:00:00.123Z') },
    expected: '{"occurred_at":"2026-10-15T10:00:00.123Z"}',
  },
  {
    description: 'integers serialize without a decimal point',
    input: { amount_minor: 125050 },
    expected: '{"amount_minor":125050}',
  },
  {
    description: 'null and false survive',
    input: { a: null, b: false },
    expected: '{"a":null,"b":false}',
  },
  { description: 'empty object', input: {}, expected: '{}' },
  { description: 'empty array', input: { a: [] }, expected: '{"a":[]}' },
];
