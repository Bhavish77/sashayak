import { describe, expect, it } from 'vitest';
import { beneficiaryIdSchema, transferIdSchema, userIdSchema } from '../ids';
import { createRouteFake } from './registry';
import { publicRoutes } from './public';

const USER_ID = userIdSchema.parse('018f6e2a-0000-7000-8000-000000000002');
const TRANSFER_ID = transferIdSchema.parse('018f6e2a-0000-7000-8000-000000000020');
const BENEFICIARY_ID = beneficiaryIdSchema.parse('018f6e2a-0000-7000-8000-000000000010');

function userSummary() {
  return {
    id: USER_ID,
    display_name: 'Aarav Sharma',
    role: 'customer' as const,
    preferred_locale: 'hi-Latn' as const,
  };
}

function tokenPair() {
  return {
    access_token: 'header.payload.signature',
    expires_in: 900 as const,
    refresh_token: 'rt_abcdef',
    user: userSummary(),
  };
}

function transfer(status: 'PREPARED' | 'CONFIRMED' | 'CANCELLED' = 'PREPARED') {
  return {
    id: TRANSFER_ID,
    reference: 'TXN-7K3QH2M9XA',
    status,
    amount_minor: 200000,
    fee_minor: 0,
    total_minor: 200000,
    currency: 'INR' as const,
    beneficiary: {
      id: BENEFICIARY_ID,
      display_name: 'Rohan Mehta',
      account_masked: 'XXXX1234',
    },
    snapshot_hash: 'a'.repeat(64),
    requires_pin: status === 'PREPARED',
    expires_at: '2026-10-14T10:05:00Z',
    created_at: '2026-10-14T10:00:00Z',
    confirmed_at: status === 'CONFIRMED' ? '2026-10-14T10:01:00Z' : null,
    completed_at: null,
    failure_code: null,
  };
}

describe('auth and profile routes', () => {
  it('auth.login: public, no roles restriction, returns a token pair', async () => {
    const route = publicRoutes['auth.login'];
    expect(route.roles).toBe('public');
    const fake = createRouteFake(route, () => tokenPair());
    const result = await fake({ email: 'aarav@example.com', password: 'hunter2' });
    expect(result.user.role).toBe('customer');
  });

  it('auth.refresh: public, returns a new token pair', async () => {
    const fake = createRouteFake(publicRoutes['auth.refresh'], () => tokenPair());
    await expect(fake({ refresh_token: 'rt_old' })).resolves.toHaveProperty('access_token');
  });

  it('auth.logout: any role, no response body', async () => {
    const fake = createRouteFake(publicRoutes['auth.logout'], () => undefined);
    await expect(fake({ refresh_token: 'rt_old' })).resolves.toBeUndefined();
  });

  it('me.get: returns the user summary', async () => {
    const fake = createRouteFake(publicRoutes['me.get'], () => userSummary());
    await expect(fake({})).resolves.toEqual(userSummary());
  });

  it('me.update: accepts a locale or null, no response body', async () => {
    const fake = createRouteFake(publicRoutes['me.update'], () => undefined);
    await expect(fake({ preferred_locale: 'hi' })).resolves.toBeUndefined();
    await expect(fake({ preferred_locale: null })).resolves.toBeUndefined();
  });

  it('me.update: rejects a locale outside en/hi/hi-Latn', async () => {
    const fake = createRouteFake(publicRoutes['me.update'], () => undefined);
    await expect(fake({ preferred_locale: 'fr' } as never)).rejects.toThrow();
  });

  it('me.setPin: customer only, no response body', () => {
    expect(publicRoutes['me.setPin'].roles).toEqual(['customer']);
  });
});

describe('wallet routes', () => {
  it('wallet.getBalance: returns available/held/currency', async () => {
    const fake = createRouteFake(publicRoutes['wallet.getBalance'], () => ({
      available_minor: 1245000,
      held_minor: 0,
      currency: 'INR' as const,
    }));
    await expect(fake({})).resolves.toEqual({
      available_minor: 1245000,
      held_minor: 0,
      currency: 'INR',
    });
  });

  it('wallet.listTransactions: paginates and filters', async () => {
    const fake = createRouteFake(publicRoutes['wallet.listTransactions'], () => ({
      items: [
        {
          id: 'tx1',
          type: 'DEBIT' as const,
          amount_minor: 50000,
          counterparty: 'Rohan Mehta',
          status: 'COMPLETED' as const,
          reference: 'TXN-7K3QH2M9XA',
          note: '',
          occurred_at: '2026-10-14T10:00:00Z',
        },
      ],
      next_cursor: null,
    }));
    const result = await fake({ limit: 10, direction: 'debit' });
    expect(result.items).toHaveLength(1);
  });

  it('wallet.listBeneficiaries: returns aliases but never a raw account number', async () => {
    const fake = createRouteFake(publicRoutes['wallet.listBeneficiaries'], () => [
      {
        id: BENEFICIARY_ID,
        display_name: 'Rohan Mehta',
        aliases: ['rohan'],
        account_masked: 'XXXX1234',
      },
    ]);
    const result = await fake({});
    expect(result[0]?.account_masked).toBe('XXXX1234');
  });

  it('wallet.createBeneficiary: rejects a handler that leaks the raw account_number in its response', async () => {
    const route = publicRoutes['wallet.createBeneficiary'];
    // A buggy handler forwarding the raw account number instead of a masked
    // one: the strict response schema (no account_number field) must
    // refuse it, so this can never leak to an API response.
    const buggyHandler = () =>
      ({
        id: BENEFICIARY_ID,
        display_name: 'Rohan Mehta',
        aliases: ['rohan'],
        account_masked: 'XXXX1234',
        account_number: '1234567890123456',
      }) as never;
    const fake = createRouteFake(route, buggyHandler);
    await expect(
      fake({ display_name: 'Rohan Mehta', aliases: ['rohan'], account_number: '1234567890123456' }),
    ).rejects.toThrow();
  });
});

describe('transfers routes', () => {
  it('transfers.prepare: public request never accepts origin_conversation_id', () => {
    const route = publicRoutes['transfers.prepare'];
    expect(() =>
      route.request.parse({
        beneficiary_id: BENEFICIARY_ID,
        amount_minor: 200000,
        currency: 'INR',
        note: null,
        origin_conversation_id: 'should-not-be-allowed',
      }),
    ).toThrow();
  });

  it('transfers.get: returns a transfer object by id', async () => {
    const fake = createRouteFake(publicRoutes['transfers.get'], () => transfer());
    await expect(fake({ id: TRANSFER_ID })).resolves.toHaveProperty('status');
  });

  it('transfers.getByReference: returns a transfer object by reference', async () => {
    const fake = createRouteFake(publicRoutes['transfers.getByReference'], () => transfer());
    await expect(fake({ reference: 'TXN-7K3QH2M9XA' })).resolves.toHaveProperty('status');
  });

  it('transfers.cancel: returns a transfer object by id', async () => {
    const fake = createRouteFake(publicRoutes['transfers.cancel'], () => transfer('CANCELLED'));
    await expect(fake({ id: TRANSFER_ID })).resolves.toHaveProperty('status', 'CANCELLED');
  });

  it('transfers.confirm: requires an idempotency key matching the API.md format', async () => {
    const route = publicRoutes['transfers.confirm'];
    expect(() =>
      route.request.parse({
        id: TRANSFER_ID,
        idempotency_key: 'short',
        snapshot_hash: 'a'.repeat(64),
      }),
    ).toThrow();
    expect(() =>
      route.request.parse({
        id: TRANSFER_ID,
        idempotency_key: 'abcdefgh12345678',
        snapshot_hash: 'a'.repeat(64),
      }),
    ).not.toThrow();
  });

  it('transfers.confirm: returns a CONFIRMED transfer', async () => {
    const fake = createRouteFake(publicRoutes['transfers.confirm'], () => transfer('CONFIRMED'));
    const result = await fake({
      id: TRANSFER_ID,
      idempotency_key: 'abcdefgh12345678',
      snapshot_hash: 'a'.repeat(64),
    });
    expect(result.status).toBe('CONFIRMED');
  });
});

describe('every public route', () => {
  it('declares roles as "public", "any", or a non-empty role list', () => {
    for (const route of Object.values(publicRoutes)) {
      const ok =
        route.roles === 'public' ||
        route.roles === 'any' ||
        (Array.isArray(route.roles) && route.roles.length > 0);
      expect(ok).toBe(true);
    }
  });

  it('has exactly 16 routes (6 auth, 4 wallet, 6 transfers)', () => {
    expect(Object.keys(publicRoutes)).toHaveLength(16);
  });
});
