import type { ServiceName } from './enums';

export interface AccessMatrixRow {
  callee: ServiceName | 'any';
  route: string;
  callers: ServiceName[] | 'any';
  notes: string;
}

/**
 * Mirrors INTERNAL_API.md's access matrix exactly. A route registered
 * under `/internal` without a row here is a startup-safety bug (AC-F10-4),
 * checked against the internal route registry in routes/internal.ts.
 */
export const serviceAccessMatrix: readonly AccessMatrixRow[] = [
  {
    callee: 'wallet',
    route: 'POST /internal/v1/holds',
    callers: ['transfers'],
    notes: 'Saga step 1',
  },
  {
    callee: 'wallet',
    route: 'POST /internal/v1/holds/:transfer_id/settle',
    callers: ['transfers'],
    notes: 'Saga step 3a',
  },
  {
    callee: 'wallet',
    route: 'POST /internal/v1/holds/:transfer_id/release',
    callers: ['transfers'],
    notes: 'Saga step 3b (compensation)',
  },
  {
    callee: 'wallet',
    route: 'GET /internal/v1/wallets/:user_id/balance',
    callers: ['transfers'],
    notes: 'Prepare pre-check',
  },
  {
    callee: 'wallet',
    route: 'GET /internal/v1/beneficiaries/:id',
    callers: ['transfers'],
    notes: 'Prepare; returns rail_token',
  },
  {
    callee: 'transfers',
    route: 'POST /internal/v1/transfers',
    callers: ['assistant'],
    notes: 'Prepare with origin_conversation_id; user token required',
  },
  {
    callee: 'transfers',
    route: 'POST /internal/v1/transfers/:id/confirm-typed',
    callers: ['assistant'],
    notes: 'Typed confirmation; user token required; refused when requires_pin',
  },
  {
    callee: 'any',
    route: 'GET /healthz, /readyz, /metrics',
    callers: 'any',
    notes: 'No token; private network only',
  },
];
