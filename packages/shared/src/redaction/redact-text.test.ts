import { describe, expect, it } from 'vitest';
import { redactText } from './redact-text';

describe('redactText: phone (F06)', () => {
  it.each([
    ['9876543210'],
    ['+919876543210'],
    ['+91 9876543210'],
    ['09876543210'],
    ['0 9876543210'],
  ])('redacts Indian mobile number "%s"', (input) => {
    const result = redactText(`call me on ${input} today`);
    expect(result).toContain('[PHONE]');
    expect(result).not.toContain(input.replace(/^0|^\+91\s?/, '').trim());
  });

  it('does not redact an 8-digit number as anything (too short for every pattern)', () => {
    const result = redactText('number is 87654321 here');
    expect(result).toContain('87654321');
  });

  // These two are 9-18 digits, so the broader account-number fallback
  // legitimately claims them even though they are not valid phone shapes
  // (11 digits; starts with 5, outside 6-9) — only the PHONE tag is wrong
  // here, not redaction itself.
  it.each([
    ['98765432101', '11 digits'],
    ['5876543210', 'starts with 5, not 6-9'],
  ])('is not tagged [PHONE] for "%s" (%s)', (input) => {
    const result = redactText(`number is ${input} here`);
    expect(result).not.toContain('[PHONE]');
  });
});

describe('redactText: email (F06)', () => {
  it('redacts a well-formed email', () => {
    const result = redactText('contact aarav@example.com for help');
    expect(result).toContain('[EMAIL]');
    expect(result).not.toContain('aarav@example.com');
  });

  it('does not redact a non-email string', () => {
    const result = redactText('this is not-an-email at all');
    expect(result).toContain('not-an-email');
    expect(result).not.toContain('[EMAIL]');
  });
});

describe('redactText: bank account (F06)', () => {
  it('redacts a 9-18 digit number near "account"', () => {
    const result = redactText('my account number is 123456789 please');
    expect(result).toContain('[ACCOUNT]');
    expect(result).not.toContain('123456789');
  });

  it('redacts a standalone 9-18 digit number not preceded by a currency marker', () => {
    const result = redactText('reference 1234567890123 noted');
    expect(result).toContain('[ACCOUNT]');
    expect(result).not.toContain('1234567890123');
  });

  it.each([
    ['12345678', '8 digits, too short'],
    ['1234567890123456789', '19 digits, too long'],
  ])('does not redact "%s" (%s)', (input) => {
    const result = redactText(`value ${input} here`);
    expect(result).toContain(input);
  });
});

describe('redactText: amounts never redacted (F06)', () => {
  it.each([['₹2,000'], ['2000'], ['Rs 500'], ['Rs. 500'], ['INR 500']])(
    'leaves "%s" untouched',
    (amount) => {
      const result = redactText(`total is ${amount} due`);
      expect(result).toContain(amount);
      expect(result).not.toContain('[ACCOUNT]');
    },
  );

  it('a currency-marked number long enough to look like an account survives', () => {
    const result = redactText('paid ₹123456789 today');
    expect(result).toContain('₹123456789');
    expect(result).not.toContain('[ACCOUNT]');
  });

  it('a currency-marked number with "Rs " prefix survives', () => {
    const result = redactText('paid Rs 1234567890 today');
    expect(result).toContain('Rs 1234567890');
    expect(result).not.toContain('[ACCOUNT]');
  });
});

describe('redactText: card numbers with Luhn check (F06)', () => {
  it('redacts a Luhn-valid 16-digit card number', () => {
    // Well-known Luhn-valid test number (Visa test card).
    const result = redactText('card 4111111111111111 on file');
    expect(result).toContain('[CARD]');
    expect(result).not.toContain('4111111111111111');
  });

  it('does not redact a Luhn-invalid same-length number as a card', () => {
    // Last digit changed from the valid test number above, breaking Luhn.
    const result = redactText('card 4111111111111112 on file');
    expect(result).not.toContain('[CARD]');
  });

  it('does not redact a 20-digit number as a card or an account (both ranges exceeded)', () => {
    const input = '12345678901234567890';
    const result = redactText(`value ${input} here`);
    expect(result).toContain(input);
  });
});

describe('redactText: PAN-like (F06)', () => {
  it('redacts AAAAA9999A', () => {
    const result = redactText('PAN is ABCDE1234F for verification');
    expect(result).toContain('[PAN]');
    expect(result).not.toContain('ABCDE1234F');
  });

  it.each([
    ['ABCDE1234', 'missing trailing letter'],
    ['abcde1234f', 'lowercase'],
  ])('does not redact "%s" (%s)', (input) => {
    const result = redactText(`value ${input} here`);
    expect(result).not.toContain('[PAN]');
  });
});

describe('redactText: Aadhaar-like (F06)', () => {
  it('redacts a bare 12-digit Aadhaar-like number', () => {
    const result = redactText('aadhaar 234567890123 on record');
    expect(result).toContain('[AADHAAR]');
    expect(result).not.toContain('234567890123');
  });

  it('redacts a grouped 4-4-4 Aadhaar-like number', () => {
    const result = redactText('aadhaar 2345 6789 0123 on record');
    expect(result).toContain('[AADHAAR]');
    expect(result).not.toContain('2345 6789 0123');
  });

  it.each([
    ['23456789012', '11 digits'],
    ['2345678901234', '13 digits'],
  ])('does not redact "%s" as Aadhaar (%s)', (input) => {
    const result = redactText(`value ${input} here`);
    expect(result).not.toContain('[AADHAAR]');
  });
});

describe('redactText: IFSC-like (F06)', () => {
  it('redacts a well-formed IFSC code', () => {
    const result = redactText('IFSC HDFC0001234 for this branch');
    expect(result).toContain('[IFSC]');
    expect(result).not.toContain('HDFC0001234');
  });

  it.each([
    ['HDFC1001234', 'fifth character is not 0'],
    ['HDF0001234', 'only 3 bank letters'],
  ])('does not redact "%s" (%s)', (input) => {
    const result = redactText(`value ${input} here`);
    expect(result).not.toContain('[IFSC]');
  });
});

describe('redactText: UPI-like handles (F06)', () => {
  it('redacts a UPI handle (no dot after @)', () => {
    const result = redactText('pay to aarav@okhdfcbank now');
    expect(result).toContain('[UPI]');
    expect(result).not.toContain('aarav@okhdfcbank');
  });

  it('redacts a numeric UPI handle', () => {
    const result = redactText('pay to 9876543210@ybl now');
    expect(result).toContain('[UPI]');
  });

  it('a regular email (dot after @) is redacted as EMAIL, not UPI', () => {
    const result = redactText('contact aarav@example.com please');
    expect(result).toContain('[EMAIL]');
    expect(result).not.toContain('[UPI]');
  });
});

describe('redactText: idempotence and robustness', () => {
  it('redacting an already-redacted string changes nothing further', () => {
    const once = redactText('call 9876543210 or email aarav@example.com');
    const twice = redactText(once);
    expect(twice).toBe(once);
  });

  it('never throws on an empty string', () => {
    expect(() => redactText('')).not.toThrow();
  });
});
