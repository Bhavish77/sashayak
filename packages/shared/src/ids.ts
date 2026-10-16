import { z } from 'zod';

/**
 * A branded UUID schema: at runtime it is just UUID validation, but the
 * brand stops a `TransferId` and a `UserId` being assigned to each other
 * by mistake at compile time (caught by `pnpm typecheck`, not a test).
 */
export function brandedUuid<Brand extends string>(_brand: Brand) {
  return z.string().uuid().brand<Brand>();
}

export const userIdSchema = brandedUuid('UserId');
export type UserId = z.infer<typeof userIdSchema>;

export const transferIdSchema = brandedUuid('TransferId');
export type TransferId = z.infer<typeof transferIdSchema>;

export const beneficiaryIdSchema = brandedUuid('BeneficiaryId');
export type BeneficiaryId = z.infer<typeof beneficiaryIdSchema>;

export const conversationIdSchema = brandedUuid('ConversationId');
export type ConversationId = z.infer<typeof conversationIdSchema>;

export const messageIdSchema = brandedUuid('MessageId');
export type MessageId = z.infer<typeof messageIdSchema>;
