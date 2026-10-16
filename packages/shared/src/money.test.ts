import { describe, expect, it } from 'vitest';
import { addMinor, formatMinorToRupees, parseRupeesToMinor, subtractMinor } from './money';

describe('parseRupeesToMinor', () => {
  it.each([
    ['1250.50', 125050],
    ['1250', 125000],
    ['0.01', 1],
    ['1,250.50', 125050],
    ['1,00,000', 10000000],
    ['0', 0],
  ])('parses "%s" to %i paise', (input, expected) => {
    expect(parseRupeesToMinor(input)).toBe(expected);
  });

  it.each([['1250.5x'], ['12.505'], ['-5'], ['abc'], ['']])('rejects "%s"', (input) => {
    expect(() => parseRupeesToMinor(input)).toThrow();
  });
});

describe('formatMinorToRupees', () => {
  it.each([
    [125050, '₹1,250.50'],
    [0, '₹0.00'],
    [10000000, '₹1,00,000.00'],
    [100, '₹1.00'],
    [1050, '₹10.50'],
  ])('formats %i paise as %s', (minor, expected) => {
    expect(formatMinorToRupees(minor)).toBe(expected);
  });

  it('round-trips parse then format for whole rupee amounts up to 1 crore', () => {
    for (const rupees of [1, 42, 999, 1000, 54321, 10000000]) {
      const minor = parseRupeesToMinor(String(rupees));
      expect(minor).toBe(rupees * 100);
    }
  });

  it('throws on a non-integer minor value (no float near money)', () => {
    expect(() => formatMinorToRupees(100.5)).toThrow();
  });
});

describe('addMinor and subtractMinor', () => {
  it('adds and subtracts integers exactly', () => {
    expect(addMinor(100, 250)).toBe(350);
    expect(subtractMinor(350, 250)).toBe(100);
  });

  it('throws on a non-integer operand (no float near money)', () => {
    expect(() => addMinor(100.5, 1)).toThrow();
    expect(() => subtractMinor(100, 1.5)).toThrow();
  });

  it('throws when the result would overflow a safe integer', () => {
    expect(() => addMinor(Number.MAX_SAFE_INTEGER, 1)).toThrow();
  });

  it('does not throw for a negative result (callers enforce non-negativity, not this helper)', () => {
    expect(subtractMinor(100, 250)).toBe(-150);
  });
});
