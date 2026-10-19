import type { z } from 'zod';

const ENV_LINE = /^([A-Z][A-Z0-9_]*)=/gm;

/**
 * AC-F10-17: every variable a config schema reads must be documented in
 * the committed `.env.example`. Returns the schema keys that are not —
 * callers assert this list is empty, as each service's own schema joins
 * the check once it exists (today, only the base schema does).
 */
export function findMissingEnvVariables(
  schemas: Array<z.ZodObject<z.ZodRawShape>>,
  envExampleContent: string,
): string[] {
  const documented = new Set([...envExampleContent.matchAll(ENV_LINE)].map((match) => match[1]));
  const required = new Set<string>();
  for (const schema of schemas) {
    for (const key of Object.keys(schema.shape)) {
      required.add(key);
    }
  }
  return [...required].filter((key) => !documented.has(key));
}
