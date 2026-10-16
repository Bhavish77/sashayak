import { describe, expect, it } from 'vitest';
import { beneficiaryIdSchema, conversationIdSchema, transferIdSchema, userIdSchema } from '../ids';
import { serviceAccessMatrix } from '../service-acl';
import { createRouteFake } from './registry';
import { internalRoutes } from './internal';

const TRANSFER_ID = transferIdSchema.parse('018f6e2a-0000-7000-8000-000000000020');
const USER_ID = userIdSchema.parse('018f6e2a-0000-7000-8000-000000000002');
const BENEFICIARY_ID = beneficiaryIdSchema.parse('018f6e2a-0000-7000-8000-000000000010');
const CONVERSATION_ID = conversationIdSchema.parse('018f6e2a-0000-7000-8000-000000000030');

describe('internalRoutes vs serviceAccessMatrix (AC-F10-4)', () => {
  it('every internal route in the registry has a matching access-matrix row with at least one caller', () => {
    for (const route of Object.values(internalRoutes)) {
      const routeKey = `${route.method} ${route.path}`;
      const matrixRow = serviceAccessMatrix.find((row) => row.route === routeKey);
      expect(matrixRow, `no access-matrix row for ${routeKey}`).toBeDefined();
      expect(matrixRow?.callers === 'any' || (matrixRow?.callers.length ?? 0) > 0).toBe(true);
    }
  });

  it('every internal route path starts with /internal/v1', () => {
    for (const route of Object.values(internalRoutes)) {
      expect(route.path.startsWith('/internal/v1')).toBe(true);
    }
  });
});

describe('wallet.holds.create', () => {
  const route = internalRoutes['wallet.holds.create'];

  it('accepts a well-formed request and a well-formed "newly held" response', async () => {
    const fake = createRouteFake(route, () => ({
      transfer_id: TRANSFER_ID,
      state: 'HELD' as const,
      available_minor: 50000,
      held_minor: 50000,
    }));

    const result = await fake({
      transfer_id: TRANSFER_ID,
      user_id: USER_ID,
      amount_minor: 50000,
      currency: 'INR',
      reference: 'TXN-7K3QH2M9XA',
      counterparty_name: 'Rohan Mehta',
      note: null,
    });
    expect(result.state).toBe('HELD');
  });

  it('accepts the "already in this state" response without available_minor/held_minor', async () => {
    const fake = createRouteFake(route, () => ({
      transfer_id: TRANSFER_ID,
      state: 'HELD' as const,
    }));

    const result = await fake({
      transfer_id: TRANSFER_ID,
      user_id: USER_ID,
      amount_minor: 50000,
      currency: 'INR',
      reference: 'TXN-7K3QH2M9XA',
      counterparty_name: 'Rohan Mehta',
      note: null,
    });
    expect(result.state).toBe('HELD');
  });

  it('rejects a request missing a required field', async () => {
    const fake = createRouteFake(route, () => ({
      transfer_id: TRANSFER_ID,
      state: 'HELD' as const,
    }));
    await expect(
      fake({
        transfer_id: TRANSFER_ID,
        amount_minor: 50000,
        currency: 'INR',
        reference: 'TXN-7K3QH2M9XA',
        counterparty_name: 'Rohan Mehta',
        note: null,
      } as never),
    ).rejects.toThrow();
  });
});

describe('transfers.prepare', () => {
  const route = internalRoutes['transfers.prepare'];

  it('accepts origin_conversation_id (the public route does not allow it)', async () => {
    const fake = createRouteFake(route, (input) => ({
      id: TRANSFER_ID,
      reference: 'TXN-7K3QH2M9XA',
      status: 'PREPARED' as const,
      amount_minor: input.amount_minor,
      fee_minor: 0,
      total_minor: input.amount_minor,
      currency: 'INR' as const,
      beneficiary: {
        id: input.beneficiary_id,
        display_name: 'Rohan Mehta',
        account_masked: 'XXXX1234',
      },
      snapshot_hash: 'a'.repeat(64),
      requires_pin: false,
      expires_at: '2026-10-14T10:05:00Z',
      created_at: '2026-10-14T10:00:00Z',
      confirmed_at: null,
      completed_at: null,
      failure_code: null,
    }));

    const result = await fake({
      beneficiary_id: BENEFICIARY_ID,
      amount_minor: 200000,
      currency: 'INR',
      note: null,
      origin_conversation_id: CONVERSATION_ID,
    });
    expect(result.status).toBe('PREPARED');
  });
});
