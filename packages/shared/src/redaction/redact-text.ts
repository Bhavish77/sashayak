import {
  AADHAAR_LIKE,
  ACCOUNT_BY_CONTEXT,
  ACCOUNT_WITH_OPTIONAL_CURRENCY_PREFIX,
  CARD_CANDIDATE,
  EMAIL,
  IFSC_LIKE,
  isLuhnValid,
  normalizeDigits,
  PAN_LIKE,
  PHONE,
  UPI_LIKE,
  UUID,
} from './patterns';

// Delimited by a Private Use Area character (U+E000), which never
// appears in ordinary chat text, so a placeholder can never collide
// with real input content. A NUL or other C0 control character would
// work too but trips ESLint's no-control-regex rule.
const UUID_SENTINEL = '';
const UUID_PLACEHOLDER = (index: number) => `${UUID_SENTINEL}UUID${index}${UUID_SENTINEL}`;
const UUID_PLACEHOLDER_PATTERN = /UUID(\d+)/g;

/**
 * F06 personal-data redaction. Patterns run most-specific first (a
 * Luhn-valid card before the generic account-number fallback, email
 * before the UPI-handle shape it would otherwise also match, Aadhaar's
 * exact 12 digits before the 9-18 digit account range) so a given match
 * gets exactly one, best-fitting token. Amounts (`₹2,000`, `Rs 500`) are
 * never in the 9+ digit ranges these patterns look for, except when a
 * bare number happens to be long enough to also look like an account —
 * the account pattern alone carries a currency-marker exception for
 * that case.
 *
 * UUIDs are extracted into placeholders before any other pattern runs,
 * and restored at the very end, so a UUID whose last group happens to
 * read as 12 decimal digits (indistinguishable from Aadhaar) is never
 * matched by any pattern below in the first place.
 */
export function redactText(input: string): string {
  const uuids: string[] = [];
  let result = input.replace(UUID, (match) => {
    const placeholder = UUID_PLACEHOLDER(uuids.length);
    uuids.push(match);
    return placeholder;
  });
  result = normalizeDigits(result);
  result = result.replace(PAN_LIKE, '[PAN]');
  result = result.replace(IFSC_LIKE, '[IFSC]');
  result = result.replace(EMAIL, '[EMAIL]');
  result = result.replace(UPI_LIKE, '[UPI]');
  // Context-named account numbers before Aadhaar/phone: "account number
  // 123456789012" must stay [ACCOUNT] even though its digits alone are
  // also Aadhaar-shaped.
  result = result.replace(ACCOUNT_BY_CONTEXT, (full, digits: string) =>
    full.replace(digits, '[ACCOUNT]'),
  );
  // Phone before Aadhaar: "+91" followed by a 10-digit number is a 12-digit
  // run that would otherwise also match the bare Aadhaar-like pattern.
  result = result.replace(PHONE, '[PHONE]');
  result = result.replace(AADHAAR_LIKE, '[AADHAAR]');
  result = result.replace(CARD_CANDIDATE, (match) => {
    const digitsOnly = match.replace(/[ -]/g, '');
    return isLuhnValid(digitsOnly) ? '[CARD]' : match;
  });
  result = result.replace(ACCOUNT_WITH_OPTIONAL_CURRENCY_PREFIX, (full, currencyMarker) =>
    currencyMarker ? full : '[ACCOUNT]',
  );
  result = result.replace(
    UUID_PLACEHOLDER_PATTERN,
    (full, indexText: string) => uuids[Number(indexText)] ?? full,
  );
  return result;
}
