import { describe, expect, it } from 'vitest';
import { beneficiarySchema, transferObjectSchema } from './transfer-object';

describe('beneficiarySchema', () => {
  it('accepts a well-formed beneficiary summary', () => {
    const value = {
      id: '018f6e2a-0000-7000-8000-000000000010',
      display_name: 'Rohan Mehta',
      account_masked: 'XXXX1234',
    };
    expect(beneficiarySchema.parse(value)).toEqual(value);
  });

  it('never accepts a full account number field (API.md: masked only)', () => {
    const value = {
      id: '018f6e2a-0000-7000-8000-000000000010',
      display_name: 'Rohan Mehta',
      account_masked: 'XXXX1234',
      account_number: '1234567890123456',
    };
    expect(() => beneficiarySchema.parse(value)).toThrow();
  });
});

function validTransfer() {
  return {
    id: '018f6e2a-0000-7000-8000-000000000020',
    reference: 'TXN-7K3QH2M9XA',
    status: 'PREPARED' as const,
    amount_minor: 200000,
    fee_minor: 0,
    total_minor: 200000,
    currency: 'INR' as const,
    beneficiary: {
      id: '018f6e2a-0000-7000-8000-000000000010',
      display_name: 'Rohan Mehta',
      account_masked: 'XXXX1234',
    },
    snapshot_hash: 'a'.repeat(64),
    requires_pin: true,
    expires_at: '2026-10-14T10:05:00Z',
    created_at: '2026-10-14T10:00:00Z',
    confirmed_at: null,
    completed_at: null,
    failure_code: null,
  };
}

describe('transferObjectSchema', () => {
  it('accepts a well-formed PREPARED transfer', () => {
    const value = validTransfer();
    expect(transferObjectSchema.parse(value)).toEqual(value);
  });

  it('accepts non-null confirmed_at, completed_at and failure_code on a terminal transfer', () => {
    const value = {
      ...validTransfer(),
      status: 'FAILED' as const,
      confirmed_at: '2026-10-14T10:01:00Z',
      completed_at: '2026-10-14T10:02:00Z',
      failure_code: 'INSUFFICIENT_FUNDS' as const,
    };
    expect(transferObjectSchema.parse(value)).toEqual(value);
  });

  it('rejects a status outside the closed transfer status set', () => {
    expect(() =>
      transferObjectSchema.parse({ ...validTransfer(), status: 'NOT_A_STATUS' }),
    ).toThrow();
  });

  it('rejects a non-positive amount_minor', () => {
    expect(() => transferObjectSchema.parse({ ...validTransfer(), amount_minor: 0 })).toThrow();
  });

  it('rejects a negative fee_minor', () => {
    expect(() => transferObjectSchema.parse({ ...validTransfer(), fee_minor: -1 })).toThrow();
  });

  it('rejects an unknown top-level property', () => {
    expect(() => transferObjectSchema.parse({ ...validTransfer(), extra: 1 })).toThrow();
  });
});
