import { z } from 'zod';
import { cardTypeSchema, localeSchema, messageRoleSchema, screenSchema } from './enums';
import { messageIdSchema } from './ids';

/**
 * `data`'s shape per card type depends on domain objects (the full
 * Transfer object, transaction history rows, FAQ results) that belong to
 * the services that produce them. Only `navigation` is narrowed so far
 * (its shape — just a screen id — was already fully specified); each
 * other card-producing task narrows its own `data` schema as it lands
 * (balance, transfer cards and so on).
 */
const navigationCardSchema = z
  .object({
    type: z.literal('navigation'),
    data: z.object({ screen: screenSchema }).strict(),
  })
  .strict();

const otherCardSchema = z
  .object({
    type: cardTypeSchema.exclude(['navigation']),
    data: z.unknown(),
  })
  .strict();

export const cardSchema = z.union([navigationCardSchema, otherCardSchema]);
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
