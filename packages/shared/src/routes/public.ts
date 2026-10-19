import { z } from 'zod';
import { directionSchema, localeSchema, roleSchema, transferStatusSchema } from '../enums';
import { beneficiaryIdSchema, transferIdSchema, userIdSchema } from '../ids';
import { paginatedResponseSchema, paginationQuerySchema } from '../pagination';
import { transferObjectSchema } from '../transfer-object';
import { definePublicRoute } from './registry';

const userSummarySchema = z
  .object({
    id: userIdSchema,
    display_name: z.string().min(1),
    role: roleSchema,
    preferred_locale: localeSchema.nullable(),
  })
  .strict();

const tokenPairSchema = z
  .object({
    access_token: z.string().min(1),
    expires_in: z.literal(900),
    refresh_token: z.string().min(1),
    user: userSummarySchema,
  })
  .strict();

/** API.md conventions: 8-64 chars from [A-Za-z0-9_-]. */
const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

const beneficiaryListItemSchema = z
  .object({
    id: beneficiaryIdSchema,
    display_name: z.string().min(1),
    aliases: z.array(z.string().min(1)),
    account_masked: z.string().min(1),
  })
  .strict();

const transactionRowSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(['CREDIT', 'DEBIT']),
    amount_minor: z.number().int().positive(),
    counterparty: z.string(),
    status: z.enum(['COMPLETED', 'PROCESSING', 'FAILED']),
    reference: z.string().min(1).nullable(),
    note: z.string(),
    occurred_at: z.string().datetime(),
  })
  .strict();

/**
 * The 16 public routes in scope for T04 (auth/profile, wallet,
 * transfers), per API.md. Conversation, support and admin routes land
 * with the tasks that build those features.
 */
export const publicRoutes = {
  // --- Auth and profile (owner: edge) ---
  'auth.login': definePublicRoute({
    method: 'POST',
    path: '/v1/auth/login',
    roles: 'public',
    request: z.object({ email: z.string().email(), password: z.string().min(1) }).strict(),
    response: tokenPairSchema,
  }),

  'auth.refresh': definePublicRoute({
    method: 'POST',
    path: '/v1/auth/refresh',
    roles: 'public',
    request: z.object({ refresh_token: z.string().min(1) }).strict(),
    response: tokenPairSchema,
  }),

  'auth.logout': definePublicRoute({
    method: 'POST',
    path: '/v1/auth/logout',
    roles: 'any',
    request: z.object({ refresh_token: z.string().min(1) }).strict(),
    response: z.void(),
  }),

  'me.get': definePublicRoute({
    method: 'GET',
    path: '/v1/me',
    roles: 'any',
    request: z.object({}).strict(),
    response: userSummarySchema,
  }),

  // API.md: "Returns 204" — no response body, same as PUT /v1/me/pin.
  'me.update': definePublicRoute({
    method: 'PATCH',
    path: '/v1/me',
    roles: 'any',
    request: z.object({ preferred_locale: localeSchema.nullable() }).strict(),
    response: z.void(),
  }),

  'me.setPin': definePublicRoute({
    method: 'PUT',
    path: '/v1/me/pin',
    roles: ['customer'],
    request: z
      .object({ pin: z.string().min(1), current_pin: z.string().min(1).optional() })
      .strict(),
    response: z.void(),
  }),

  // --- Wallet (owner: wallet) ---
  'wallet.getBalance': definePublicRoute({
    method: 'GET',
    path: '/v1/wallet',
    roles: ['customer'],
    request: z.object({}).strict(),
    response: z
      .object({
        available_minor: z.number().int().nonnegative(),
        held_minor: z.number().int().nonnegative(),
        currency: z.literal('INR'),
      })
      .strict(),
  }),

  'wallet.listTransactions': definePublicRoute({
    method: 'GET',
    path: '/v1/transactions',
    roles: ['customer'],
    request: z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        direction: directionSchema.optional(),
        counterparty: z.string().optional(),
      })
      .merge(paginationQuerySchema)
      .strict(),
    response: paginatedResponseSchema(transactionRowSchema),
  }),

  'wallet.listBeneficiaries': definePublicRoute({
    method: 'GET',
    path: '/v1/beneficiaries',
    roles: ['customer'],
    request: z.object({}).strict(),
    response: z.array(beneficiaryListItemSchema),
  }),

  'wallet.createBeneficiary': definePublicRoute({
    method: 'POST',
    path: '/v1/beneficiaries',
    roles: ['customer'],
    request: z
      .object({
        display_name: z.string().min(1),
        aliases: z.array(z.string().min(1)),
        account_number: z.string().min(1),
      })
      .strict(),
    response: beneficiaryListItemSchema,
  }),

  // --- Transfers (owner: transfers) ---
  'transfers.prepare': definePublicRoute({
    method: 'POST',
    path: '/v1/transfers',
    roles: ['customer'],
    request: z
      .object({
        beneficiary_id: beneficiaryIdSchema,
        amount_minor: z.number().int().positive(),
        currency: z.literal('INR'),
        note: z.string().max(80).nullable().optional(),
      })
      .strict(),
    response: transferObjectSchema,
  }),

  'transfers.get': definePublicRoute({
    method: 'GET',
    path: '/v1/transfers/:id',
    roles: ['customer'],
    request: z.object({ id: transferIdSchema }).strict(),
    response: transferObjectSchema,
  }),

  'transfers.getByReference': definePublicRoute({
    method: 'GET',
    path: '/v1/transfers/by-reference/:reference',
    roles: ['customer'],
    request: z.object({ reference: z.string().min(1) }).strict(),
    response: transferObjectSchema,
  }),

  'transfers.list': definePublicRoute({
    method: 'GET',
    path: '/v1/transfers',
    roles: ['customer'],
    request: z
      .object({ status: transferStatusSchema.optional() })
      .merge(paginationQuerySchema)
      .strict(),
    response: paginatedResponseSchema(transferObjectSchema),
  }),

  'transfers.confirm': definePublicRoute({
    method: 'POST',
    path: '/v1/transfers/:id/confirm',
    roles: ['customer'],
    request: z
      .object({
        id: transferIdSchema,
        idempotency_key: idempotencyKeySchema,
        snapshot_hash: z.string().min(1),
        pin: z.string().min(1).optional(),
      })
      .strict(),
    response: transferObjectSchema,
  }),

  'transfers.cancel': definePublicRoute({
    method: 'POST',
    path: '/v1/transfers/:id/cancel',
    roles: ['customer'],
    request: z.object({ id: transferIdSchema }).strict(),
    response: transferObjectSchema,
  }),
} as const;
