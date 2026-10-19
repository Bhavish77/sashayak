import { z } from 'zod';
import { serviceNameSchema } from '../enums';
import { eventIdSchema } from '../ids';
import { isoTimestampSchema } from '../timestamp';

export const eventSubjectSchema = z
  .object({
    type: z.string().min(1),
    id: z.string().min(1),
  })
  .strict();

/** W3C Trace Context traceparent header form: version-traceid-spanid-flags, lowercase hex only. */
export const traceparentSchema = z.string().regex(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);

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
      occurred_at: isoTimestampSchema,
      producer: serviceNameSchema,
      request_id: z.string().min(1),
      traceparent: traceparentSchema,
      subject: eventSubjectSchema,
      payload: payloadSchema,
    })
    .strict();
}
