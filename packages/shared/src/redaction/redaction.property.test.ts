import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { redactObject } from './redact-object';
import { redactText } from './redact-text';

const phoneArbitrary = fc.integer({ min: 6_000_000_000, max: 9_999_999_999 }).map(String);

const emailArbitrary = fc
  .tuple(fc.stringMatching(/^[a-z][a-z0-9]{2,9}$/), fc.stringMatching(/^[a-z][a-z0-9]{2,9}$/))
  .map(([local, domain]) => `${local}@${domain}.com`);

describe('redactText: property tests', () => {
  it('a generated phone number never survives in the output', () => {
    fc.assert(
      fc.property(phoneArbitrary, (phone) => {
        const result = redactText(`please call ${phone} soon`);
        expect(result).not.toContain(phone);
      }),
      { numRuns: 200 },
    );
  });

  it('a generated email address never survives in the output', () => {
    fc.assert(
      fc.property(emailArbitrary, (email) => {
        const result = redactText(`contact ${email} for help`);
        expect(result).not.toContain(email);
      }),
      { numRuns: 200 },
    );
  });
});

describe('redactText: fuzz tests', () => {
  it('never throws on an arbitrary string', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(() => redactText(input)).not.toThrow();
      }),
      { numRuns: 500 },
    );
  });

  it('is idempotent on an arbitrary string', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const once = redactText(input);
        expect(redactText(once)).toBe(once);
      }),
      { numRuns: 500 },
    );
  });
});

describe('redactObject: fuzz tests', () => {
  it('never throws on an arbitrary JSON-like value', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (input) => {
        expect(() => redactObject(input)).not.toThrow();
      }),
      { numRuns: 300 },
    );
  });

  it('is idempotent on an arbitrary JSON-like value', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (input) => {
        const once = redactObject(input);
        expect(redactObject(once)).toEqual(once);
      }),
      { numRuns: 300 },
    );
  });
});
