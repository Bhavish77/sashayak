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

/**
 * 12 digits, bare or grouped 4-4-4 with a single space between groups.
 * The grouped branch is guarded on both sides against being a 3-group
 * slice of a longer 4-group run (a 16-digit grouped card number): without
 * the lookbehind/lookahead, the first or last three groups of a card
 * number would match here first and leave the remaining group exposed
 * as plain text instead of the whole number being evaluated as a card.
 */
export const AADHAAR_LIKE = /(?<!\d[ -])\b\d{4}[ ]\d{4}[ ]\d{4}\b(?![ -]\d)|\b\d{12}\b/g;

/**
 * Indian mobile: optional +91 or a leading 0 (with an optional separating
 * space/dash), then a 10-digit number starting 6-9 — written bare, or
 * grouped 5+5 or 3+3+4 with a single space or dash between groups (a
 * phone number copied from a contact card is rarely typed as ten bare
 * digits). Three top-level branches, not one optional-prefix group,
 * because `\b` cannot sit between two digits (the prefix's last digit
 * and the number's first digit are both word characters, so there is no
 * boundary there); a negative lookbehind stands in for `\b` wherever a
 * bare digit run must not itself be part of a longer one.
 */
const PHONE_CORE = String.raw`(?:[6-9]\d{9}|[6-9]\d{4}[ -]\d{5}|[6-9]\d{2}[ -]\d{3}[ -]\d{4})`;
export const PHONE = new RegExp(
  String.raw`\+91[ -]?${PHONE_CORE}\b|(?<!\d)0[ -]?${PHONE_CORE}\b|(?<!\d)${PHONE_CORE}\b`,
  'g',
);

/**
 * 13-19 digits (candidate card numbers), bare or grouped in four-digit
 * blocks separated by a single space or dash — the backreference `\1`
 * requires the same separator throughout, so a mixed sequence never
 * matches. Luhn validity is checked separately, not by this regex alone;
 * the caller strips any separators before running that check.
 */
export const CARD_CANDIDATE = /\b\d{4}([ -])\d{4}\1\d{4}\1\d{4}\b|\b\d{13,19}\b/g;

const DEVANAGARI_DIGIT_ZERO = 0x0966;
const FULLWIDTH_DIGIT_ZERO = 0xff10;

/**
 * Converts Devanagari digits (U+0966-U+096F) and fullwidth digits
 * (U+FF10-U+FF19) to plain ASCII 0-9, leaving every other character —
 * including Devanagari script itself — untouched. redactText runs this
 * first so a phone or account number typed in Devanagari digits is seen
 * and redacted, not missed because the patterns above only know ASCII
 * digits. This is local to redaction: the assistant's amount parser (F06)
 * reads the raw, un-redacted message, so it needs its own digit
 * normalization and cannot rely on this one having already run.
 */
export function normalizeDigits(input: string): string {
  let result = '';
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= DEVANAGARI_DIGIT_ZERO && code <= DEVANAGARI_DIGIT_ZERO + 9) {
      result += String(code - DEVANAGARI_DIGIT_ZERO);
    } else if (code >= FULLWIDTH_DIGIT_ZERO && code <= FULLWIDTH_DIGIT_ZERO + 9) {
      result += String(code - FULLWIDTH_DIGIT_ZERO);
    } else {
      result += char;
    }
  }
  return result;
}

/** A 9-18 digit run, optionally preceded by a currency marker captured for the caller to check. */
export const ACCOUNT_WITH_OPTIONAL_CURRENCY_PREFIX = /(₹|Rs\.?[ ]?|INR[ ]?)?\b(\d{9,18})\b/g;

/**
 * A 9-18 digit run directly named as an account by the word in front of
 * it ("account", "a/c" or "acct", optionally followed by "number"/"no"
 * and a colon). This must run before AADHAAR_LIKE: a 12-digit account
 * number ("account number 123456789012") would otherwise be claimed by
 * the bare 12-digit Aadhaar pattern first, since nothing about its shape
 * says "account" once the trigger word is stripped away — only the
 * context does. Shorter runs (under 9 digits) are deliberately left
 * alone, so "account 2000" is not mistaken for an account number.
 */
export const ACCOUNT_BY_CONTEXT =
  /\b(?:account|a\/c|acct)\b(?:\s*(?:number|no))?\s*:?\s*(\d{9,18})\b/gi;

/**
 * A UUID (8-4-4-4-12 hex digits) is an identifier, never personal data,
 * and must never be altered — including when one of its groups happens
 * to look like a sensitive number (a 12-hex-digit group is also 12
 * decimal digits, which is exactly Aadhaar's shape). redact-text.ts
 * extracts every UUID into a placeholder before any other pattern runs,
 * then restores the original text afterwards, so no digit-based pattern
 * ever sees UUID characters to match against.
 */
export const UUID =
  /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;

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
