import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { findMissingEnvVariables } from './env-example-coverage';
import { baseConfigSchema } from './schema';

const ENV_EXAMPLE_PATH = fileURLToPath(new URL('../../../../.env.example', import.meta.url));

describe('findMissingEnvVariables', () => {
  it('finds nothing missing when every schema key is documented', () => {
    const content = 'FOO=bar\nBAZ=qux\n';
    const schema = z.object({ FOO: z.string(), BAZ: z.string() });
    expect(findMissingEnvVariables([schema], content)).toEqual([]);
  });

  it('reports a variable the schema needs but .env.example does not document', () => {
    const content = 'FOO=bar\n';
    const schema = z.object({ FOO: z.string(), MISSING_ONE: z.string() });
    expect(findMissingEnvVariables([schema], content)).toEqual(['MISSING_ONE']);
  });

  it('ignores comment lines (a variable only mentioned in prose is still missing)', () => {
    const content = '# FOO is documented here only as a comment, not a real line\n';
    const schema = z.object({ FOO: z.string() });
    expect(findMissingEnvVariables([schema], content)).toEqual(['FOO']);
  });

  it('checks the union of several schemas at once', () => {
    const content = 'FOO=bar\n';
    const schemaA = z.object({ FOO: z.string() });
    const schemaB = z.object({ BAR: z.string() });
    expect(findMissingEnvVariables([schemaA, schemaB], content)).toEqual(['BAR']);
  });
});

describe('.env.example coverage (AC-F10-17)', () => {
  it('documents every variable the base config schema reads', () => {
    const content = readFileSync(ENV_EXAMPLE_PATH, 'utf8');
    const missing = findMissingEnvVariables([baseConfigSchema], content);
    expect(missing).toEqual([]);
  });
});
