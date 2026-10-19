import { z } from 'zod';
import {
  auditActionSchema,
  auditResultSchema,
  failureCodeSchema,
  transferStatusSchema,
} from '../enums';
import { conversationIdSchema, transferIdSchema, userIdSchema } from '../ids';
import { isoTimestampSchema } from '../timestamp';
import { eventEnvelopeSchema } from './envelope';

/** EVENTS.md catalog: `audit.recorded` v1. */
export const auditRecordedV1PayloadSchema = z
  .object({
    occurred_at: isoTimestampSchema,
    actor_id: z.string().min(1).nullable(),
    actor_role: z.string().min(1).nullable(),
    action: auditActionSchema,
    resource_type: z.string().min(1),
    resource_id: z.string().min(1),
    result: auditResultSchema,
    request_id: z.string().min(1),
    details: z.record(z.string(), z.unknown()),
  })
  .strict();
export type AuditRecordedV1Payload = z.infer<typeof auditRecordedV1PayloadSchema>;

export const auditRecordedV1EventSchema = eventEnvelopeSchema(
  'audit.recorded',
  1,
  auditRecordedV1PayloadSchema,
);

/** EVENTS.md catalog: `transfer.status_changed` v1. */
export const transferStatusChangedV1PayloadSchema = z
  .object({
    transfer_id: transferIdSchema,
    reference: z.string().min(1),
    user_id: userIdSchema,
    from_status: transferStatusSchema.nullable(),
    to_status: transferStatusSchema,
    amount_minor: z.number().int().positive(),
    failure_code: failureCodeSchema.nullable(),
    origin_conversation_id: conversationIdSchema.nullable(),
  })
  .strict();
export type TransferStatusChangedV1Payload = z.infer<typeof transferStatusChangedV1PayloadSchema>;

export const transferStatusChangedV1EventSchema = eventEnvelopeSchema(
  'transfer.status_changed',
  1,
  transferStatusChangedV1PayloadSchema,
);
