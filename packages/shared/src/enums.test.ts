import { describe, expect, it } from 'vitest';
import {
  cardTypes,
  failureCodes,
  holdStates,
  intents,
  locales,
  messageRoles,
  roles,
  screens,
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
});
