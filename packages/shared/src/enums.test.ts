import { describe, expect, it } from 'vitest';
import {
  auditActions,
  auditResults,
  cardTypes,
  failureCodes,
  holdStates,
  intents,
  locales,
  messageRoles,
  roles,
  screens,
  serviceNames,
  transferStatuses,
} from './enums';

describe('transferStatuses', () => {
  it('equals the twelve statuses in ARCHITECTURE.md section 6.2', () => {
    expect(transferStatuses).toHaveLength(12);
    expect(new Set(transferStatuses)).toEqual(
      new Set([
        'PREPARED',
        'CONFIRMED',
        'HOLD_PLACED',
        'SUBMITTED',
        'SETTLING',
        'RELEASING',
        'COMPLETED',
        'FAILED',
        'PENDING_UNKNOWN',
        'NEEDS_REVIEW',
        'CANCELLED',
        'EXPIRED',
      ]),
    );
  });
});

describe('holdStates', () => {
  it('equals the five hold states in ARCHITECTURE.md section 6.1', () => {
    expect(holdStates).toHaveLength(5);
    expect(new Set(holdStates)).toEqual(
      new Set(['HELD', 'SETTLED', 'RELEASED', 'REJECTED', 'VOIDED']),
    );
  });
});

describe('intents', () => {
  it('equals the closed intent set in F03', () => {
    expect(new Set(intents)).toEqual(
      new Set([
        'CHECK_BALANCE',
        'LIST_TRANSACTIONS',
        'TRANSACTION_STATUS',
        'TRANSFER_MONEY',
        'NAVIGATE',
        'FAQ_SUPPORT',
        'CREATE_TICKET',
        'SMALL_TALK',
        'OUT_OF_SCOPE',
      ]),
    );
  });
});

describe('other closed enums', () => {
  it('locales has exactly en, hi, hi-Latn', () => {
    expect(new Set(locales)).toEqual(new Set(['en', 'hi', 'hi-Latn']));
  });

  it('roles has exactly customer, support, admin', () => {
    expect(new Set(roles)).toEqual(new Set(['customer', 'support', 'admin']));
  });

  it('screens has exactly the F04 navigation allowlist', () => {
    expect(new Set(screens)).toEqual(
      new Set([
        'home',
        'transactions',
        'send_money',
        'beneficiaries',
        'add_beneficiary',
        'profile',
        'limits',
        'support',
      ]),
    );
  });

  it('failureCodes has exactly the API.md failure_code enum', () => {
    expect(new Set(failureCodes)).toEqual(
      new Set([
        'INSUFFICIENT_FUNDS',
        'HOLD_REJECTED',
        'RAIL_REJECTED',
        'RAIL_INVALID',
        'ADMIN_RESOLVED',
      ]),
    );
  });

  it('cardTypes has exactly the API.md card type list', () => {
    expect(new Set(cardTypes)).toEqual(
      new Set([
        'balance',
        'transactions',
        'transfer_confirmation',
        'transfer_status',
        'navigation',
        'menu',
        'faq',
        'ticket',
      ]),
    );
  });

  it('messageRoles has exactly user, assistant, system_notice', () => {
    expect(new Set(messageRoles)).toEqual(new Set(['user', 'assistant', 'system_notice']));
  });

  it('serviceNames has exactly the five application services (ADR-015)', () => {
    expect(new Set(serviceNames)).toEqual(
      new Set(['edge', 'assistant', 'wallet', 'transfers', 'audit']),
    );
  });

  it('auditResults has exactly success, denied, error', () => {
    expect(new Set(auditResults)).toEqual(new Set(['success', 'denied', 'error']));
  });

  it('auditActions has exactly the forty actions in F07 "What is recorded"', () => {
    expect(auditActions).toHaveLength(40);
    expect(new Set(auditActions)).toEqual(
      new Set([
        'auth.login.success',
        'auth.login.failure',
        'auth.refresh',
        'auth.refresh_reuse_detected',
        'auth.logout',
        'auth.pin.failure',
        'auth.pin.locked',
        'auth.pin.changed',
        'assistant.action',
        'policy.denied',
        'output_guard.blocked',
        'ticket.created',
        'transfer.prepared',
        'transfer.confirmed',
        'transfer.hold_placed',
        'transfer.submitted',
        'transfer.settling',
        'transfer.releasing',
        'transfer.completed',
        'transfer.failed',
        'transfer.pending_unknown',
        'transfer.needs_review',
        'transfer.cancelled',
        'transfer.expired',
        'transfer.resolved',
        'wallet.hold_placed',
        'wallet.hold_rejected',
        'wallet.hold_settled',
        'wallet.hold_released',
        'wallet.hold_voided',
        'beneficiary.created',
        'admin.view_conversation',
        'admin.unmask',
        'admin.view_llm_calls',
        'admin.view_tickets',
        'admin.view_transfer',
        'admin.reconcile',
        'admin.resolve',
        'admin.view_audit',
        'audit.verify',
      ]),
    );
  });
});
