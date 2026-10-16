import { z } from 'zod';
import { holdStateSchema } from '../enums';
import {
  beneficiaryIdSchema,
  conversationIdSchema,
  messageIdSchema,
  transferIdSchema,
  userIdSchema,
} from '../ids';
import { transferObjectSchema } from '../transfer-object';
import { defineInternalRoute } from './registry';

/**
 * The 7 business internal routes from INTERNAL_API.md (the health-check
 * row in service-acl.ts has no request/response body, so it is not a
 * registry entry). Path params and query params are folded into one flat
 * request object; the service skeleton that reads real HTTP requests
 * (T07) is responsible for assembling that shape before validating.
 */
export const internalRoutes = {
  'wallet.holds.create': defineInternalRoute({
    method: 'POST',
    path: '/internal/v1/holds',
    callee: 'wallet',
    callers: ['transfers'],
    request: z
      .object({
        transfer_id: transferIdSchema,
        user_id: userIdSchema,
        amount_minor: z.number().int().positive(),
        currency: z.literal('INR'),
        reference: z.string().min(1),
        counterparty_name: z.string().min(1),
        note: z.string().nullable(),
      })
      .strict(),
    response: z
      .object({
        transfer_id: transferIdSchema,
        state: holdStateSchema,
        available_minor: z.number().int().nonnegative().optional(),
        held_minor: z.number().int().nonnegative().optional(),
      })
      .strict(),
  }),

  'wallet.holds.settle': defineInternalRoute({
    method: 'POST',
    path: '/internal/v1/holds/:transfer_id/settle',
    callee: 'wallet',
    callers: ['transfers'],
    request: z
      .object({
        transfer_id: transferIdSchema,
        amount_minor: z.number().int().positive(),
      })
      .strict(),
    response: z.object({ state: holdStateSchema }).strict(),
  }),

  'wallet.holds.release': defineInternalRoute({
    method: 'POST',
    path: '/internal/v1/holds/:transfer_id/release',
    callee: 'wallet',
    callers: ['transfers'],
    request: z
      .object({
        transfer_id: transferIdSchema,
        user_id: userIdSchema,
        amount_minor: z.number().int().positive(),
      })
      .strict(),
    response: z.object({ state: holdStateSchema }).strict(),
  }),

  'wallet.wallets.getBalance': defineInternalRoute({
    method: 'GET',
    path: '/internal/v1/wallets/:user_id/balance',
    callee: 'wallet',
    callers: ['transfers'],
    request: z.object({ user_id: userIdSchema }).strict(),
    response: z
      .object({
        available_minor: z.number().int().nonnegative(),
        held_minor: z.number().int().nonnegative(),
        currency: z.literal('INR'),
      })
      .strict(),
  }),

  'wallet.beneficiaries.get': defineInternalRoute({
    method: 'GET',
    path: '/internal/v1/beneficiaries/:id',
    callee: 'wallet',
    callers: ['transfers'],
    request: z.object({ id: beneficiaryIdSchema, user_id: userIdSchema }).strict(),
    response: z
      .object({
        id: beneficiaryIdSchema,
        display_name: z.string().min(1),
        account_masked: z.string().min(1),
        rail_token: z.string().min(1),
      })
      .strict(),
  }),

  'transfers.prepare': defineInternalRoute({
    method: 'POST',
    path: '/internal/v1/transfers',
    callee: 'transfers',
    callers: ['assistant'],
    request: z
      .object({
        beneficiary_id: beneficiaryIdSchema,
        amount_minor: z.number().int().positive(),
        currency: z.literal('INR'),
        note: z.string().max(80).nullable(),
        origin_conversation_id: conversationIdSchema.nullable().optional(),
      })
      .strict(),
    response: transferObjectSchema,
  }),

  'transfers.confirmTyped': defineInternalRoute({
    method: 'POST',
    path: '/internal/v1/transfers/:id/confirm-typed',
    callee: 'transfers',
    callers: ['assistant'],
    request: z
      .object({
        id: transferIdSchema,
        message_id: messageIdSchema,
        snapshot_hash: z.string().min(1),
      })
      .strict(),
    response: transferObjectSchema,
  }),
} as const;
