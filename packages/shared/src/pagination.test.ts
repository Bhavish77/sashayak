import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { paginatedResponseSchema, paginationQuerySchema } from './pagination';

describe('paginationQuerySchema', () => {
  it('defaults limit to 20 and cursor to null', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ limit: 20, cursor: null });
  });

  it('accepts a limit up to 50', () => {
    expect(paginationQuerySchema.parse({ limit: 50 })).toEqual({ limit: 50, cursor: null });
  });

  it('rejects a limit above 50', () => {
    expect(() => paginationQuerySchema.parse({ limit: 51 })).toThrow();
  });

  it('rejects a limit below 1', () => {
    expect(() => paginationQuerySchema.parse({ limit: 0 })).toThrow();
  });

  it('coerces a string limit (as it would arrive on a query string)', () => {
    expect(paginationQuerySchema.parse({ limit: '10' })).toEqual({ limit: 10, cursor: null });
  });
});

describe('paginatedResponseSchema', () => {
  const numbersResponse = paginatedResponseSchema(z.number());

  it('accepts a list of items with a null next_cursor', () => {
    expect(numbersResponse.parse({ items: [1, 2, 3], next_cursor: null })).toEqual({
      items: [1, 2, 3],
      next_cursor: null,
    });
  });

  it('accepts a non-null next_cursor', () => {
    expect(numbersResponse.parse({ items: [], next_cursor: 'abc' })).toEqual({
      items: [],
      next_cursor: 'abc',
    });
  });

  it('rejects an item that fails the item schema', () => {
    expect(() => numbersResponse.parse({ items: ['not a number'], next_cursor: null })).toThrow();
  });

  it('rejects unknown top-level properties', () => {
    expect(() => numbersResponse.parse({ items: [], next_cursor: null, extra: true })).toThrow();
  });
});
