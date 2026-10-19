import type { z } from 'zod';

/**
 * Carries only the failing variables' names, never their values — Zod's
 * own issue messages can echo the received value back for some issue
 * types (an invalid enum, for instance), so callers must read
 * `variableNames`, never `message`, when deciding what to print.
 */
export class ConfigError extends Error {
  readonly variableNames: string[];

  constructor(variableNames: string[]) {
    super(`Invalid or missing configuration: ${variableNames.join(', ')}`);
    this.name = 'ConfigError';
    this.variableNames = variableNames;
  }
}

/**
 * Validates `env` (every service's actual environment, by default)
 * against a Zod object schema. Environment variables are flat, so each
 * issue's path is exactly one variable name (FR-OPS-5, AC-F06-11).
 */
export function loadConfig<Schema extends z.ZodTypeAny>(
  schema: Schema,
  env: Record<string, string | undefined> = process.env,
): z.infer<Schema> {
  const result = schema.safeParse(env);
  if (!result.success) {
    const variableNames = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new ConfigError(variableNames);
  }
  return result.data as z.infer<Schema>;
}

/**
 * The entry-point form: on failure, names the bad variables on stderr and
 * exits non-zero instead of letting the service start half-configured.
 * `exit` is injectable so this can be unit-tested without ending the test
 * process.
 */
export function loadConfigOrExit<Schema extends z.ZodTypeAny>(
  schema: Schema,
  env: Record<string, string | undefined> = process.env,
  exit: (code: number) => never = (code) => process.exit(code) as never,
): z.infer<Schema> {
  try {
    return loadConfig(schema, env);
  } catch (error) {
    if (error instanceof ConfigError) {
      // Startup fails before a logger exists, so this is the one place a
      // plain console.error is correct rather than a smell.
      console.error(
        `Configuration error — missing or invalid environment variable(s): ${error.variableNames.join(', ')}`,
      );
      return exit(1);
    }
    throw error;
  }
}
