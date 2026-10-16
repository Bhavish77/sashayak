import { z } from 'zod';

/** API.md conventions: `?limit=` (default 20, max 50) and an opaque `?cursor=`. */
export const paginationQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().nullable().default(null),
  })
  .strict();
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function paginatedResponseSchema<Item extends z.ZodTypeAny>(itemSchema: Item) {
  return z
    .object({
      items: z.array(itemSchema),
      next_cursor: z.string().nullable(),
    })
    .strict();
}
