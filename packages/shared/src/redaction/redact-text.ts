import {
  AADHAAR_LIKE,
  ACCOUNT_WITH_OPTIONAL_CURRENCY_PREFIX,
  CARD_CANDIDATE,
  EMAIL,
  IFSC_LIKE,
  isLuhnValid,
  PAN_LIKE,
  PHONE,
  UPI_LIKE,
} from './patterns';

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
 */
export function redactText(input: string): string {
  let result = input;
  result = result.replace(PAN_LIKE, '[PAN]');
  result = result.replace(IFSC_LIKE, '[IFSC]');
  result = result.replace(EMAIL, '[EMAIL]');
  result = result.replace(UPI_LIKE, '[UPI]');
  // Phone before Aadhaar: "+91" followed by a 10-digit number is a 12-digit
  // run that would otherwise also match the bare Aadhaar-like pattern.
  result = result.replace(PHONE, '[PHONE]');
  result = result.replace(AADHAAR_LIKE, '[AADHAAR]');
  result = result.replace(CARD_CANDIDATE, (match) => (isLuhnValid(match) ? '[CARD]' : match));
  result = result.replace(ACCOUNT_WITH_OPTIONAL_CURRENCY_PREFIX, (full, currencyMarker) =>
    currencyMarker ? full : '[ACCOUNT]',
  );
  return result;
}
