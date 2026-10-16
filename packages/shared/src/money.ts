/**
 * Money helpers. Everything is integer paise (`*_minor`). Nothing here
 * ever goes through `parseFloat`/`Number()` on a decimal string, because
 * binary floating point cannot represent paise exactly (CLAUDE.md: no
 * floating point near money).
 */

const RUPEES_INPUT_PATTERN = /^\d{1,3}(,?\d{2,3})*(\.\d{1,2})?$/;

export function parseRupeesToMinor(input: string): number {
  const withoutCommas = input.replace(/,/g, '');
  if (!RUPEES_INPUT_PATTERN.test(input) || !/^\d+(\.\d{1,2})?$/.test(withoutCommas)) {
    throw new Error(`Not a valid rupee amount: "${input}"`);
  }

  const [rupeesPart = '0', fractionPart = ''] = withoutCommas.split('.');
  const paisePart = fractionPart.padEnd(2, '0');
  const minor = BigInt(rupeesPart) * 100n + BigInt(paisePart);

  assertSafeInteger(minor);
  return Number(minor);
}

export function formatMinorToRupees(minor: number): string {
  assertIntegerMinor(minor);

  const sign = minor < 0 ? '-' : '';
  const absMinor = Math.abs(minor);
  const rupees = String(Math.trunc(absMinor / 100));
  const paise = String(absMinor % 100).padStart(2, '0');

  return `${sign}₹${groupIndian(rupees)}.${paise}`;
}

export function addMinor(a: number, b: number): number {
  assertIntegerMinor(a);
  assertIntegerMinor(b);
  const result = BigInt(a) + BigInt(b);
  assertSafeInteger(result);
  return Number(result);
}

export function subtractMinor(a: number, b: number): number {
  assertIntegerMinor(a);
  assertIntegerMinor(b);
  const result = BigInt(a) - BigInt(b);
  assertSafeInteger(result);
  return Number(result);
}

function assertIntegerMinor(value: number): void {
  if (!Number.isInteger(value)) {
    throw new Error(`Money value must be an integer number of paise, got ${value}`);
  }
}

function assertSafeInteger(value: bigint): void {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error(`Money value ${value} exceeds the safe integer range`);
  }
}

/** Indian digit grouping: the last 3 digits, then groups of 2. */
function groupIndian(digits: string): string {
  if (digits.length <= 3) {
    return digits;
  }

  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const groupedRest = rest.replace(/(\d)(?=(\d{2})+$)/g, '$1,');
  return `${groupedRest},${lastThree}`;
}
