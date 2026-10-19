import { z } from 'zod';

/** Pino's own level names, in the order pino defines them. */
export const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export const logLevelSchema = z.enum(logLevels);
export type LogLevel = z.infer<typeof logLevelSchema>;

/**
 * Fields every service reads, regardless of what else it needs (F10:
 * "a Zod schema per service on top of a common base"). A service's own
 * schema extends this with whatever it alone requires (ports, database
 * URLs, keys); `loadConfig` validates the combined schema the same way
 * either way.
 */
export const baseConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: logLevelSchema.default('info'),
});
export type BaseConfig = z.infer<typeof baseConfigSchema>;
