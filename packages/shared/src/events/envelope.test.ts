import { describe, expect, it } from 'vitest';
import { eventEnvelopeSchema } from './envelope';
import { z } from 'zod';

const payloadSchema = z.object({ amount_minor: z.number().int() }).strict();
const schema = eventEnvelopeSchema('test.event', 1, payloadSchema);

function validEnvelope() {
  return {
    event_id: '018f6e2a-0000-7000-8000-000000000001',
    type: 'test.event' as const,
    version: 1 as const,
    occurred_at: '2026-10-15T10:00:00.123Z',
    producer: 'transfers' as const,
    request_id: '01JREQABCDEF0000000000000',
    traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    subject: { type: 'transfer', id: '018f6e2a-0000-7000-8000-000000000002' },
    payload: { amount_minor: 50000 },
  };
}

describe('eventEnvelopeSchema', () => {
  it('accepts a well-formed envelope', () => {
    const value = validEnvelope();
    expect(schema.parse(value)).toEqual(value);
  });

  it('rejects a mismatched type', () => {
    expect(() => schema.parse({ ...validEnvelope(), type: 'other.event' })).toThrow();
  });

  it('rejects a mismatched version', () => {
    expect(() => schema.parse({ ...validEnvelope(), version: 2 })).toThrow();
  });

  it('rejects a producer outside the closed service list', () => {
    expect(() => schema.parse({ ...validEnvelope(), producer: 'mock-rail' })).toThrow();
  });

  it('rejects a payload that fails its own schema', () => {
    expect(() =>
      schema.parse({ ...validEnvelope(), payload: { amount_minor: 'not-a-number' } }),
    ).toThrow();
  });

  it('rejects unknown top-level properties', () => {
    expect(() => schema.parse({ ...validEnvelope(), extra: 1 })).toThrow();
  });

  it('rejects unknown subject properties', () => {
    const value = validEnvelope();
    expect(() => schema.parse({ ...value, subject: { ...value.subject, extra: 1 } })).toThrow();
  });
});
