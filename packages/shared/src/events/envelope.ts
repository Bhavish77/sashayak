import { z } from 'zod';
import { serviceNameSchema } from '../enums';
import { eventIdSchema } from '../ids';

export const eventSubjectSchema = z
  .object({
    type: z.string().min(1),
    id: z.string().min(1),
  })
  .strict();

/**
 * The envelope every event shares (EVENTS.md). `type` and `version` are
 * pinned to a specific literal per catalog entry, so a payload is always
 * read through the exact schema its producer declared.
 */
export function eventEnvelopeSchema<
  Type extends string,
  Version extends number,
  Payload extends z.ZodTypeAny,
>(type: Type, version: Version, payloadSchema: Payload) {
  return z
    .object({
      event_id: eventIdSchema,
      type: z.literal(type),
      version: z.literal(version),
      occurred_at: z.string().datetime(),
      producer: serviceNameSchema,
      request_id: z.string().min(1),
      traceparent: z.string().min(1),
      subject: eventSubjectSchema,
      payload: payloadSchema,
    })
    .strict();
}
