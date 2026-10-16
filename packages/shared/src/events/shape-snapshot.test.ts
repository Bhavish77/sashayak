import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { brandedUuid } from '../ids';
import { assertShapeCompatible, objectShapeSnapshot } from './shape-snapshot';

describe('objectShapeSnapshot', () => {
  it('describes required, nullable and optional fields', () => {
    const schema = z
      .object({
        a: z.string(),
        b: z.number().nullable(),
        c: z.boolean().optional(),
      })
      .strict();

    expect(objectShapeSnapshot(schema)).toEqual({
      a: { required: true, nullable: false, kind: 'string' },
      b: { required: true, nullable: true, kind: 'number' },
      c: { required: false, nullable: false, kind: 'boolean' },
    });
  });

  it('unwraps a branded id schema to its underlying kind', () => {
    const schema = z.object({ id: brandedUuid('ThingId').nullable() }).strict();
    expect(objectShapeSnapshot(schema)).toEqual({
      id: { required: true, nullable: true, kind: 'string' },
    });
  });

  it('tags enum and literal fields with their allowed values, so a changed value set counts as retyped', () => {
    const schema = z
      .object({
        status: z.enum(['a', 'b']),
        kind: z.literal('fixed'),
      })
      .strict();

    expect(objectShapeSnapshot(schema)).toEqual({
      status: { required: true, nullable: false, kind: 'enum:a,b' },
      kind: { required: true, nullable: false, kind: 'literal:fixed' },
    });
  });
});

describe('assertShapeCompatible (AC-F10-8)', () => {
  const baseline = objectShapeSnapshot(
    z.object({ amount_minor: z.number().int(), note: z.string().optional() }).strict(),
  );

  it('passes when the live shape is identical to the baseline', () => {
    const identical = objectShapeSnapshot(
      z.object({ amount_minor: z.number().int(), note: z.string().optional() }).strict(),
    );
    expect(() => assertShapeCompatible(baseline, identical)).not.toThrow();
  });

  it('passes when a new field is added as optional', () => {
    const withAddedOptional = objectShapeSnapshot(
      z
        .object({
          amount_minor: z.number().int(),
          note: z.string().optional(),
          tag: z.string().optional(),
        })
        .strict(),
    );
    expect(() => assertShapeCompatible(baseline, withAddedOptional)).not.toThrow();
  });

  it('fails when a new field is added as required', () => {
    const withAddedRequired = objectShapeSnapshot(
      z
        .object({ amount_minor: z.number().int(), note: z.string().optional(), tag: z.string() })
        .strict(),
    );
    expect(() => assertShapeCompatible(baseline, withAddedRequired)).toThrow(/tag/);
  });

  it('fails when a required field is removed', () => {
    const withRemovedField = objectShapeSnapshot(
      z.object({ note: z.string().optional() }).strict(),
    );
    expect(() => assertShapeCompatible(baseline, withRemovedField)).toThrow(/amount_minor/);
  });

  it('fails when a field is retyped', () => {
    const withRetypedField = objectShapeSnapshot(
      z.object({ amount_minor: z.string(), note: z.string().optional() }).strict(),
    );
    expect(() => assertShapeCompatible(baseline, withRetypedField)).toThrow(/amount_minor/);
  });
});
