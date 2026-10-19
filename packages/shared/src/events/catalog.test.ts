import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { eventIdSchema, transferIdSchema, userIdSchema } from '../ids';
import { auditRecordedV1EventSchema, transferStatusChangedV1EventSchema } from './catalog';

function validAuditRecordedEnvelope(): z.infer<typeof auditRecordedV1EventSchema> {
  return {
    event_id: eventIdSchema.parse('018f6e2a-0000-7000-8000-000000000001'),
    type: 'audit.recorded' as const,
    version: 1 as const,
    occurred_at: '2026-10-15T10:00:00.123Z',
    producer: 'edge' as const,
    request_id: '01JREQABCDEF0000000000000',
    traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    subject: { type: 'user', id: '018f6e2a-0000-7000-8000-000000000002' },
    payload: {
      occurred_at: '2026-10-15T10:00:00.000Z',
      actor_id: '018f6e2a-0000-7000-8000-000000000002',
      actor_role: 'customer',
      action: 'auth.login.success' as const,
      resource_type: 'user',
      resource_id: '018f6e2a-0000-7000-8000-000000000002',
      result: 'success' as const,
      request_id: '01JREQABCDEF0000000000000',
      details: {},
    },
  };
}

function validTransferStatusChangedEnvelope(): z.infer<typeof transferStatusChangedV1EventSchema> {
  return {
    event_id: eventIdSchema.parse('018f6e2a-0000-7000-8000-000000000003'),
    type: 'transfer.status_changed' as const,
    version: 1 as const,
    occurred_at: '2026-10-15T10:00:00.123Z',
    producer: 'transfers' as const,
    request_id: '01JREQABCDEF0000000000001',
    traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    subject: { type: 'transfer', id: '018f6e2a-0000-7000-8000-000000000004' },
    payload: {
      transfer_id: transferIdSchema.parse('018f6e2a-0000-7000-8000-000000000004'),
      reference: 'TXN-7K3QH2M9XA',
      user_id: userIdSchema.parse('018f6e2a-0000-7000-8000-000000000002'),
      from_status: 'CONFIRMED' as const,
      to_status: 'HOLD_PLACED' as const,
      amount_minor: 50000,
      failure_code: null,
      origin_conversation_id: null,
    },
  };
}

describe('auditRecordedV1EventSchema', () => {
  it('accepts a well-formed audit.recorded v1 event', () => {
    const value = validAuditRecordedEnvelope();
    expect(auditRecordedV1EventSchema.parse(value)).toEqual(value);
  });

  it('accepts null actor_id and actor_role (system-initiated actions)', () => {
    const value = validAuditRecordedEnvelope();
    value.payload.actor_id = null;
    value.payload.actor_role = null;
    expect(auditRecordedV1EventSchema.parse(value)).toEqual(value);
  });

  it('rejects an action outside the closed F07 action list', () => {
    const value = validAuditRecordedEnvelope();
    expect(() =>
      auditRecordedV1EventSchema.parse({
        ...value,
        payload: { ...value.payload, action: 'not_a_real_action' },
      }),
    ).toThrow();
  });

  it('rejects a result outside success/denied/error', () => {
    const value = validAuditRecordedEnvelope();
    expect(() =>
      auditRecordedV1EventSchema.parse({
        ...value,
        payload: { ...value.payload, result: 'maybe' },
      }),
    ).toThrow();
  });

  it('rejects an unknown payload property', () => {
    const value = validAuditRecordedEnvelope();
    expect(() =>
      auditRecordedV1EventSchema.parse({
        ...value,
        payload: { ...value.payload, extra: 1 },
      }),
    ).toThrow();
  });

  it('rejects a payload occurred_at without exactly three fractional digits', () => {
    const value = validAuditRecordedEnvelope();
    expect(() =>
      auditRecordedV1EventSchema.parse({
        ...value,
        payload: { ...value.payload, occurred_at: '2026-10-15T10:00:00Z' },
      }),
    ).toThrow();
  });
});

describe('transferStatusChangedV1EventSchema', () => {
  it('accepts a well-formed transfer.status_changed v1 event', () => {
    const value = validTransferStatusChangedEnvelope();
    expect(transferStatusChangedV1EventSchema.parse(value)).toEqual(value);
  });

  it('accepts a null from_status (transfer just created)', () => {
    const value = validTransferStatusChangedEnvelope();
    value.payload.from_status = null;
    value.payload.to_status = 'PREPARED';
    expect(transferStatusChangedV1EventSchema.parse(value)).toEqual(value);
  });

  it('accepts a non-null failure_code and origin_conversation_id', () => {
    const value = validTransferStatusChangedEnvelope();
    value.payload.failure_code = 'INSUFFICIENT_FUNDS';
    value.payload.origin_conversation_id =
      '018f6e2a-0000-7000-8000-000000000005' as typeof value.payload.origin_conversation_id;
    expect(transferStatusChangedV1EventSchema.parse(value)).toEqual(value);
  });

  it('rejects a to_status outside the closed transfer status set', () => {
    const value = validTransferStatusChangedEnvelope();
    expect(() =>
      transferStatusChangedV1EventSchema.parse({
        ...value,
        payload: { ...value.payload, to_status: 'NOT_A_STATUS' },
      }),
    ).toThrow();
  });

  it('rejects a non-positive amount_minor', () => {
    const value = validTransferStatusChangedEnvelope();
    expect(() =>
      transferStatusChangedV1EventSchema.parse({
        ...value,
        payload: { ...value.payload, amount_minor: 0 },
      }),
    ).toThrow();
  });

  it('rejects an unknown payload property', () => {
    const value = validTransferStatusChangedEnvelope();
    expect(() =>
      transferStatusChangedV1EventSchema.parse({
        ...value,
        payload: { ...value.payload, extra: 1 },
      }),
    ).toThrow();
  });
});
