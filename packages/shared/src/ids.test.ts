import { describe, expect, it } from 'vitest';
import {
  brandedUuid,
  beneficiaryIdSchema,
  conversationIdSchema,
  messageIdSchema,
  transferIdSchema,
  userIdSchema,
} from './ids';

const VALID_UUID = '018f6e2a-0000-7000-8000-000000000001';

describe('brandedUuid', () => {
  it('accepts a valid UUID', () => {
    const schema = brandedUuid('TestId');
    expect(schema.parse(VALID_UUID)).toBe(VALID_UUID);
  });

  it('rejects a non-UUID string', () => {
    const schema = brandedUuid('TestId');
    expect(() => schema.parse('not-a-uuid')).toThrow();
  });

  it('rejects an empty string', () => {
    const schema = brandedUuid('TestId');
    expect(() => schema.parse('')).toThrow();
  });
});

describe('concrete branded id schemas', () => {
  it.each([
    ['userIdSchema', userIdSchema],
    ['transferIdSchema', transferIdSchema],
    ['beneficiaryIdSchema', beneficiaryIdSchema],
    ['conversationIdSchema', conversationIdSchema],
    ['messageIdSchema', messageIdSchema],
  ])('%s accepts a valid UUID and rejects garbage', (_name, schema) => {
    expect(schema.parse(VALID_UUID)).toBe(VALID_UUID);
    expect(() => schema.parse('garbage')).toThrow();
  });
});
