import { z } from 'zod';
import { failureCodeSchema, transferStatusSchema } from './enums';
import { beneficiaryIdSchema, transferIdSchema } from './ids';

/** API.md: the beneficiary summary as returned to a user, never a full account number. */
export const beneficiarySchema = z
  .object({
    id: beneficiaryIdSchema,
    display_name: z.string().min(1),
    account_masked: z.string().min(1),
  })
  .strict();
export type Beneficiary = z.infer<typeof beneficiarySchema>;

/** API.md: the Transfer object, returned by every transfers route. */
export const transferObjectSchema = z
  .object({
    id: transferIdSchema,
    reference: z.string().min(1),
    status: transferStatusSchema,
    amount_minor: z.number().int().positive(),
    fee_minor: z.number().int().nonnegative(),
    total_minor: z.number().int().positive(),
    currency: z.literal('INR'),
    beneficiary: beneficiarySchema,
    snapshot_hash: z.string().min(1),
    requires_pin: z.boolean(),
    expires_at: z.string().datetime(),
    created_at: z.string().datetime(),
    confirmed_at: z.string().datetime().nullable(),
    completed_at: z.string().datetime().nullable(),
    failure_code: failureCodeSchema.nullable(),
  })
  .strict();
export type TransferObject = z.infer<typeof transferObjectSchema>;
