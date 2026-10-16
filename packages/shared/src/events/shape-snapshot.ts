import { z } from 'zod';

/**
 * A hand-comparable description of one field of a Zod object schema,
 * deliberately not the schema itself: the point of a snapshot test is a
 * visible, reviewed diff whenever a contract changes (AC-F10-8).
 */
export interface FieldShape {
  required: boolean;
  nullable: boolean;
  kind: string;
}

export function fieldShapeOf(schema: z.ZodTypeAny): FieldShape {
  let current: z.ZodTypeAny = schema;
  let required = true;
  let nullable = false;

  // Peel wrapper types in whatever order they were applied.
  for (;;) {
    if (current instanceof z.ZodOptional) {
      required = false;
      current = current._def.innerType;
      continue;
    }
    if (current instanceof z.ZodNullable) {
      nullable = true;
      current = current._def.innerType;
      continue;
    }
    if (current instanceof z.ZodBranded) {
      current = current._def.type;
      continue;
    }
    break;
  }

  return { required, nullable, kind: kindOf(current) };
}

function kindOf(schema: z.ZodTypeAny): string {
  if (schema instanceof z.ZodString) return 'string';
  if (schema instanceof z.ZodNumber) return 'number';
  if (schema instanceof z.ZodBoolean) return 'boolean';
  if (schema instanceof z.ZodEnum) return `enum:${[...schema._def.values].sort().join(',')}`;
  if (schema instanceof z.ZodLiteral) return `literal:${String(schema._def.value)}`;
  if (schema instanceof z.ZodObject) return 'object';
  if (schema instanceof z.ZodArray) return 'array';
  if (schema instanceof z.ZodRecord) return 'record';
  if (schema instanceof z.ZodUnknown) return 'unknown';
  return 'unrecognized';
}

export function objectShapeSnapshot(
  schema: z.ZodObject<z.ZodRawShape>,
): Record<string, FieldShape> {
  const result: Record<string, FieldShape> = {};
  for (const [key, fieldSchema] of Object.entries(schema.shape)) {
    result[key] = fieldShapeOf(fieldSchema as z.ZodTypeAny);
  }
  return result;
}

/**
 * EVENTS.md producer rule: "Add fields only as optional within a
 * version." Throws with every problem found, rather than stopping at the
 * first, so a real drift report lists everything at once.
 */
export function assertShapeCompatible(
  baseline: Record<string, FieldShape>,
  current: Record<string, FieldShape>,
): void {
  const problems: string[] = [];

  for (const [key, baselineField] of Object.entries(baseline)) {
    const currentField = current[key];
    if (!currentField) {
      problems.push(`field "${key}" was removed`);
      continue;
    }
    if (
      currentField.required !== baselineField.required ||
      currentField.nullable !== baselineField.nullable ||
      currentField.kind !== baselineField.kind
    ) {
      problems.push(
        `field "${key}" changed shape: was ${JSON.stringify(baselineField)}, now ${JSON.stringify(currentField)}`,
      );
    }
  }

  for (const [key, currentField] of Object.entries(current)) {
    if (!(key in baseline) && currentField.required) {
      problems.push(`field "${key}" was added as required (must be optional within a version)`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Incompatible schema change:\n${problems.join('\n')}`);
  }
}
