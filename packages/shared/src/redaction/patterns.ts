/**
 * F06 personal-data patterns. Order matters in redact-text.ts: more
 * specific shapes are checked before more general ones (a Luhn-valid card
 * number before the generic 9-18 digit account fallback, a 12-digit
 * Aadhaar-like number before that same fallback, and so on), so a given
 * digit run gets exactly one, best-fitting token.
 */

export const PAN_LIKE = /\b[A-Z]{5}\d{4}[A-Z]\b/g;

export const IFSC_LIKE = /\b[A-Z]{4}0[A-Z0-9]{6}\b/g;

export const EMAIL = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g;

export const UPI_LIKE = /\b[\w.-]+@[A-Za-z][\w-]*\b/g;

/** 12 digits, bare or grouped 4-4-4 with a single space between groups. */
export const AADHAAR_LIKE = /\b\d{4}[ ]\d{4}[ ]\d{4}\b|\b\d{12}\b/g;

/**
 * Indian mobile: optional +91 or a leading 0 (with an optional separating
 * space/dash), then 10 digits starting 6-9. Three branches, not one
 * optional-prefix group, because `\b` cannot sit between two digits (the
 * prefix's last digit and the number's first digit are both word
 * characters, so there is no boundary there); a negative lookbehind
 * stands in for `\b` wherever a bare digit run must not itself be part of
 * a longer one.
 */
export const PHONE = /\+91[ -]?[6-9]\d{9}\b|(?<!\d)0[ -]?[6-9]\d{9}\b|(?<!\d)[6-9]\d{9}\b/g;

/** 13-19 digits (candidate card numbers); Luhn validity is checked separately, not by this regex alone. */
export const CARD_CANDIDATE = /\b\d{13,19}\b/g;

/** A 9-18 digit run, optionally preceded by a currency marker captured for the caller to check. */
export const ACCOUNT_WITH_OPTIONAL_CURRENCY_PREFIX = /(₹|Rs\.?[ ]?|INR[ ]?)?\b(\d{9,18})\b/g;

export function isLuhnValid(digits: string): boolean {
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}
