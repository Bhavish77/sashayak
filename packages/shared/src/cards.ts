import { z } from 'zod';
import { cardTypeSchema, localeSchema, messageRoleSchema } from './enums';
import { messageIdSchema } from './ids';

/**
 * `data`'s shape per card type depends on domain objects (the full
 * Transfer object, transaction history rows, FAQ results) that belong to
 * the services that produce them. Only `type` is closed here; each
 * card-producing task narrows its own `data` schema into a discriminated
 * union as it lands (balance, navigation, transfer cards and so on).
 */
export const cardSchema = z
  .object({
    type: cardTypeSchema,
    data: z.unknown(),
  })
  .strict();
export type Card = z.infer<typeof cardSchema>;

export const messageSchema = z
  .object({
    id: messageIdSchema,
    role: messageRoleSchema,
    content: z.string(),
    language: localeSchema,
    cards: z.array(cardSchema),
    created_at: z.string().datetime(),
  })
  .strict();
export type Message = z.infer<typeof messageSchema>;
