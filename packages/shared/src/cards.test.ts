import { describe, expect, it } from 'vitest';
import { cardSchema, messageSchema } from './cards';

describe('cardSchema', () => {
  it('accepts every closed card type with arbitrary data', () => {
    for (const type of [
      'balance',
      'transactions',
      'transfer_confirmation',
      'transfer_status',
      'navigation',
      'menu',
      'faq',
      'ticket',
    ]) {
      expect(cardSchema.parse({ type, data: { anything: 1 } })).toEqual({
        type,
        data: { anything: 1 },
      });
    }
  });

  it('rejects a card type outside the closed set', () => {
    expect(() => cardSchema.parse({ type: 'not_a_card', data: {} })).toThrow();
  });

  it('rejects unknown top-level properties', () => {
    expect(() => cardSchema.parse({ type: 'balance', data: {}, extra: 1 })).toThrow();
  });
});

describe('messageSchema', () => {
  const base = {
    id: '018f6e2a-0000-7000-8000-000000000001',
    role: 'assistant',
    content: 'Aapka available balance ₹12,450.00 hai.',
    language: 'hi-Latn',
    cards: [
      { type: 'balance', data: { available_minor: 1245000, held_minor: 0, currency: 'INR' } },
    ],
    created_at: '2026-10-14T10:00:00Z',
  };

  it('accepts a well-formed message', () => {
    expect(messageSchema.parse(base)).toEqual(base);
  });

  it('accepts an empty cards array', () => {
    expect(messageSchema.parse({ ...base, cards: [] })).toEqual({ ...base, cards: [] });
  });

  it('rejects a role outside user/assistant/system_notice', () => {
    expect(() => messageSchema.parse({ ...base, role: 'admin' })).toThrow();
  });

  it('rejects an invalid id', () => {
    expect(() => messageSchema.parse({ ...base, id: 'not-a-uuid' })).toThrow();
  });

  it('rejects unknown top-level properties', () => {
    expect(() => messageSchema.parse({ ...base, extra: 1 })).toThrow();
  });
});
