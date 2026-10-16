import { describe, expect, it } from 'vitest';
import { serviceAccessMatrix } from './service-acl';

describe('serviceAccessMatrix', () => {
  it('lists exactly the internal routes in INTERNAL_API.md', () => {
    const routes = serviceAccessMatrix.map((row) => row.route).sort();
    expect(routes).toEqual(
      [
        'POST /internal/v1/holds',
        'POST /internal/v1/holds/:transfer_id/settle',
        'POST /internal/v1/holds/:transfer_id/release',
        'GET /internal/v1/wallets/:user_id/balance',
        'GET /internal/v1/beneficiaries/:id',
        'POST /internal/v1/transfers',
        'POST /internal/v1/transfers/:id/confirm-typed',
        'GET /healthz, /readyz, /metrics',
      ].sort(),
    );
  });

  it('every row has at least one caller', () => {
    for (const row of serviceAccessMatrix) {
      expect(row.callers === 'any' || row.callers.length > 0).toBe(true);
    }
  });

  it('every business route (not the health row) names a single real callee service', () => {
    const businessRows = serviceAccessMatrix.filter((row) => row.callee !== 'any');
    expect(businessRows.length).toBe(7);
    for (const row of businessRows) {
      expect(['edge', 'assistant', 'wallet', 'transfers', 'audit']).toContain(row.callee);
    }
  });

  it('the wallet hold routes are callable only by transfers', () => {
    const holdRows = serviceAccessMatrix.filter(
      (row) => row.callee === 'wallet' && row.route.includes('/holds'),
    );
    expect(holdRows.length).toBeGreaterThan(0);
    for (const row of holdRows) {
      expect(row.callers).toEqual(['transfers']);
    }
  });

  it('the transfers prepare and confirm-typed routes are callable only by assistant', () => {
    const transfersRows = serviceAccessMatrix.filter((row) => row.callee === 'transfers');
    expect(transfersRows.length).toBe(2);
    for (const row of transfersRows) {
      expect(row.callers).toEqual(['assistant']);
    }
  });
});
