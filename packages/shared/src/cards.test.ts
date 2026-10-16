import { describe, expect, it } from 'vitest';
import { cardSchema, messageSchema } from './cards';

describe('cardSchema', () => {
  // navigation's data is now a closed { screen } shape (see the
  // "navigation card" describe block below); the other 7 types stay
  // z.unknown() until their own owning task narrows them.
  it('accepts every closed card type other than navigation with arbitrary data', () => {
    for (const type of [
      'balance',
      'transactions',
      'transfer_confirmation',
      'transfer_status',
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

describe('cardSchema: navigation card', () => {
  it('accepts a navigation card with an allowlisted screen', () => {
    const value = { type: 'navigation', data: { screen: 'send_money' } };
    expect(cardSchema.parse(value)).toEqual(value);
  });

  it('rejects navigation data missing screen', () => {
    expect(() => cardSchema.parse({ type: 'navigation', data: {} })).toThrow();
  });

  it('rejects navigation data with an unknown property', () => {
    expect(() =>
      cardSchema.parse({ type: 'navigation', data: { screen: 'home', extra: 1 } }),
    ).toThrow();
  });

  it('rejects a screen outside the navigation allowlist', () => {
    expect(() => cardSchema.parse({ type: 'navigation', data: { screen: 'settings' } })).toThrow();
  });

  it('rejects arbitrary data that would have passed before this was narrowed', () => {
    expect(() => cardSchema.parse({ type: 'navigation', data: { anything: 1 } })).toThrow();
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
