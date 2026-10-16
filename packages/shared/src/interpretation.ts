import { z } from 'zod';
import {
  dateRangeRelativeSchema,
  directionSchema,
  intentSchema,
  localeSchema,
  screenSchema,
} from './enums';

/**
 * A sanity ceiling on a model-extracted amount, purely to reject a
 * hallucinating or adversarial model's absurd number before it reaches
 * anything else. This is deliberately not the real per-transfer business
 * limit (configurable, enforced later by the policy engine against live
 * config) — it only guards the shape of interpreter output.
 */
export const MAX_PLAUSIBLE_AMOUNT_MINOR = 100_000_000_00; // ₹10,00,00,000

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD)');

const dateRangeSchema = z
  .object({
    relative: dateRangeRelativeSchema.nullable(),
    from: isoDateSchema.nullable(),
    to: isoDateSchema.nullable(),
  })
  .strict()
  .nullable();

/**
 * F03: every key is always present; `null` means "the model did not
 * extract this." Strict so a hallucinated extra entity key is invalid
 * output rather than silently ignored (FR-NLU-4: nothing unvalidated is
 * ever executed).
 */
const entitiesSchema = z
  .object({
    amount_minor: z.number().int().positive().max(MAX_PLAUSIBLE_AMOUNT_MINOR).nullable(),
    amount_text: z.string().max(200).nullable(),
    currency: z.literal('INR').nullable(),
    recipient_text: z.string().max(200).nullable(),
    date_range: dateRangeSchema,
    direction: directionSchema.nullable(),
    limit: z.number().int().min(1).max(50).nullable(),
    reference: z.string().max(200).nullable(),
    screen: screenSchema.nullable(),
  })
  .strict();

/**
 * F03 interpretation schema. FR-NLU-4: "The interpreter's output must
 * validate against a strict schema" — `.strict()` here is that
 * requirement, not a style choice.
 */
export const interpretationSchema = z
  .object({
    language: localeSchema,
    intent: intentSchema,
    confidence: z.number().min(0).max(1),
    multiple_intents: z.boolean(),
    entities: entitiesSchema,
    missing: z.array(z.string()),
  })
  .strict();

export type Interpretation = z.infer<typeof interpretationSchema>;
