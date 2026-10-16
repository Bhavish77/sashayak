import { describe, expect, it } from 'vitest';
import {
  interpretationSchema,
  MAX_PLAUSIBLE_AMOUNT_MINOR,
  type Interpretation,
} from './interpretation';

function validInterpretation(): Interpretation {
  return {
    language: 'hi-Latn',
    intent: 'TRANSFER_MONEY',
    confidence: 0.92,
    multiple_intents: false,
    entities: {
      amount_minor: 200000,
      amount_text: '2 hazaar',
      currency: 'INR',
      recipient_text: 'Rohan',
      date_range: null,
      direction: null,
      limit: null,
      reference: null,
      screen: null,
    },
    missing: [],
  };
}

describe('interpretationSchema: valid input', () => {
  it('accepts a well-formed interpretation', () => {
    const value = validInterpretation();
    expect(interpretationSchema.parse(value)).toEqual(value);
  });

  it('accepts a date_range entity for a history request', () => {
    const value = validInterpretation();
    value.intent = 'LIST_TRANSACTIONS';
    value.entities.date_range = { relative: 'last_week', from: null, to: null };
    expect(interpretationSchema.parse(value)).toEqual(value);
  });

  it('accepts a custom date_range with explicit bounds', () => {
    const value = validInterpretation();
    value.intent = 'LIST_TRANSACTIONS';
    value.entities.date_range = { relative: 'custom', from: '2026-10-01', to: '2026-10-14' };
    expect(interpretationSchema.parse(value)).toEqual(value);
  });

  it('accepts missing listing required slots', () => {
    const value = validInterpretation();
    value.entities.amount_minor = null;
    value.entities.recipient_text = null;
    value.missing = ['amount', 'recipient'];
    expect(interpretationSchema.parse(value)).toEqual(value);
  });
});

describe('interpretationSchema: missing required fields', () => {
  it.each(['language', 'intent', 'confidence', 'multiple_intents', 'entities', 'missing'])(
    'rejects when top-level field "%s" is absent',
    (field) => {
      const value = validInterpretation() as Record<string, unknown>;
      delete value[field];
      expect(() => interpretationSchema.parse(value)).toThrow();
    },
  );

  it('rejects when an entities key is absent', () => {
    const value = validInterpretation();
    const entities = value.entities as Record<string, unknown>;
    delete entities.screen;
    expect(() => interpretationSchema.parse(value)).toThrow();
  });
});

describe('interpretationSchema: extra fields rejected', () => {
  it('rejects an unknown top-level property', () => {
    const value = { ...validInterpretation(), extra_field: 'nope' };
    expect(() => interpretationSchema.parse(value)).toThrow();
  });

  it('rejects an unknown entities property', () => {
    const value = validInterpretation();
    (value.entities as Record<string, unknown>).extra_field = 'nope';
    expect(() => interpretationSchema.parse(value)).toThrow();
  });
});

describe('interpretationSchema: unknown intent rejected', () => {
  it('rejects an intent outside the closed set', () => {
    const value = { ...validInterpretation(), intent: 'DELETE_EVERYTHING' };
    expect(() => interpretationSchema.parse(value)).toThrow();
  });
});

describe('interpretationSchema: amount bounds', () => {
  it('rejects a zero amount', () => {
    const value = validInterpretation();
    value.entities.amount_minor = 0;
    expect(() => interpretationSchema.parse(value)).toThrow();
  });

  it('rejects a negative amount', () => {
    const value = validInterpretation();
    value.entities.amount_minor = -500;
    expect(() => interpretationSchema.parse(value)).toThrow();
  });

  it('rejects a non-integer amount', () => {
    const value = validInterpretation();
    value.entities.amount_minor = 200000.5;
    expect(() => interpretationSchema.parse(value)).toThrow();
  });

  it('rejects an amount above the plausibility ceiling', () => {
    const value = validInterpretation();
    value.entities.amount_minor = MAX_PLAUSIBLE_AMOUNT_MINOR + 1;
    expect(() => interpretationSchema.parse(value)).toThrow();
  });

  it('accepts an amount exactly at the plausibility ceiling', () => {
    const value = validInterpretation();
    value.entities.amount_minor = MAX_PLAUSIBLE_AMOUNT_MINOR;
    expect(interpretationSchema.parse(value)).toEqual(value);
  });
});

describe('interpretationSchema: other structural rules', () => {
  it('rejects confidence outside 0..1', () => {
    const value = { ...validInterpretation(), confidence: 1.5 };
    expect(() => interpretationSchema.parse(value)).toThrow();
  });

  it('rejects a currency other than INR', () => {
    const value = validInterpretation();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately outside the closed type, to prove the runtime schema rejects it too
    value.entities.currency = 'USD' as any;
    expect(() => interpretationSchema.parse(value)).toThrow();
  });

  it('rejects a date_range.relative outside the closed set', () => {
    const value = validInterpretation();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately outside the closed type, to prove the runtime schema rejects it too
    value.entities.date_range = { relative: 'next_week', from: null, to: null } as any;
    expect(() => interpretationSchema.parse(value)).toThrow();
  });

  it('rejects a screen outside the navigation allowlist', () => {
    const value = validInterpretation();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately outside the closed type, to prove the runtime schema rejects it too
    value.entities.screen = 'settings' as any;
    expect(() => interpretationSchema.parse(value)).toThrow();
  });
});
