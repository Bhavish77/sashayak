import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { redactObject } from './redact-object';
import { redactText } from './redact-text';

/**
 * Phone numbers are generated both bare and grouped (5+5 or 3+3+4, space
 * or dash separated) — an earlier version of this generator only ever
 * produced the bare 10-digit shape, so it never exercised the grouped
 * forms a real user types and missed that redactText didn't handle them.
 */
const phoneArbitrary = fc
  .tuple(
    fc.integer({ min: 6_000_000_000, max: 9_999_999_999 }).map(String),
    fc.constantFrom<'bare' | 'space55' | 'dash55' | 'space334' | 'dash334'>(
      'bare',
      'space55',
      'dash55',
      'space334',
      'dash334',
    ),
  )
  .map(([digits, shape]) => {
    switch (shape) {
      case 'space55':
        return `${digits.slice(0, 5)} ${digits.slice(5)}`;
      case 'dash55':
        return `${digits.slice(0, 5)}-${digits.slice(5)}`;
      case 'space334':
        return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
      case 'dash334':
        return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
      case 'bare':
      default:
        return digits;
    }
  });

const emailArbitrary = fc
  .tuple(fc.stringMatching(/^[a-z][a-z0-9]{2,9}$/), fc.stringMatching(/^[a-z][a-z0-9]{2,9}$/))
  .map(([local, domain]) => `${local}@${domain}.com`);

/**
 * Luhn-valid 16-digit card numbers, generated bare and grouped (space or
 * dash, 4-4-4-4) — same reasoning as the phone generator above.
 */
const cardArbitrary = fc
  .tuple(
    fc.integer({ min: 400_000_000_000_000, max: 499_999_999_999_999 }).map(String),
    fc.constantFrom<'bare' | 'space' | 'dash'>('bare', 'space', 'dash'),
  )
  .map(([first15, shape]) => {
    const digits = first15.padStart(15, '0');
    const checkDigit = luhnCheckDigit(digits);
    const full = `${digits}${checkDigit}`;
    if (shape === 'bare') {
      return full;
    }
    const separator = shape === 'space' ? ' ' : '-';
    return [full.slice(0, 4), full.slice(4, 8), full.slice(8, 12), full.slice(12, 16)].join(
      separator,
    );
  });

function luhnCheckDigit(first15Digits: string): number {
  let sum = 0;
  let shouldDouble = true;
  for (let i = first15Digits.length - 1; i >= 0; i--) {
    let digit = Number(first15Digits[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return (10 - (sum % 10)) % 10;
}

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

  it('a generated Luhn-valid card number never survives in the output', () => {
    fc.assert(
      fc.property(cardArbitrary, (card) => {
        const result = redactText(`card ${card} on file`);
        expect(result).toContain('[CARD]');
        expect(result).not.toContain(card);
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

  it('never throws on an arbitrary object with a forced cycle, and is idempotent', () => {
    fc.assert(
      fc.property(fc.object(), (base) => {
        const withCycle = base as Record<string, unknown>;
        withCycle.self = withCycle;
        expect(() => redactObject(withCycle)).not.toThrow();
        const once = redactObject(withCycle);
        expect(() => redactObject(once)).not.toThrow();
        expect(redactObject(once)).toEqual(once);
      }),
      { numRuns: 200 },
    );
  });
});
