import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ConfigError, loadConfig, loadConfigOrExit } from './load-config';
import { baseConfigSchema } from './schema';

describe('loadConfig', () => {
  it('applies defaults when optional variables are unset', () => {
    const config = loadConfig(baseConfigSchema, {});
    expect(config.NODE_ENV).toBe('development');
    expect(config.LOG_LEVEL).toBe('info');
  });

  it('parses a present variable over its default', () => {
    const config = loadConfig(baseConfigSchema, { NODE_ENV: 'production', LOG_LEVEL: 'warn' });
    expect(config.NODE_ENV).toBe('production');
    expect(config.LOG_LEVEL).toBe('warn');
  });

  it('throws a ConfigError naming the missing variable', () => {
    const schema = z.object({ REQUIRED_VAR: z.string() });
    let error: unknown;
    try {
      loadConfig(schema, {});
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).variableNames).toEqual(['REQUIRED_VAR']);
  });

  it('throws a ConfigError naming a malformed variable without ever including its value', () => {
    // A key-material-shaped field, standing in for the real Ed25519 key
    // schemas T11 builds: too short to be real key material.
    const schema = z.object({ SIGNING_KEY: z.string().min(32) });
    const secretLookingValue = 'short-but-secret-looking-value';
    let error: unknown;
    try {
      loadConfig(schema, { SIGNING_KEY: secretLookingValue });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).variableNames).toEqual(['SIGNING_KEY']);
    expect((error as Error).message).not.toContain(secretLookingValue);
  });

  it('coerces a numeric-looking environment string to a number', () => {
    const schema = z.object({ MAX_RETRIES: z.coerce.number().int() });
    const config = loadConfig(schema, { MAX_RETRIES: '5' });
    expect(config.MAX_RETRIES).toBe(5);
  });

  it('extends the base schema with a service-specific field', () => {
    const serviceLikeSchema = baseConfigSchema.extend({ SERVICE_PORT: z.coerce.number().int() });
    const config = loadConfig(serviceLikeSchema, { NODE_ENV: 'test', SERVICE_PORT: '4000' });
    expect(config.NODE_ENV).toBe('test');
    expect(config.SERVICE_PORT).toBe(4000);
  });

  it('never throws for a reason other than a ConfigError', () => {
    expect(() => loadConfig(baseConfigSchema, {})).not.toThrow();
  });

  it('reports a root-level issue (empty path) as "(configuration)", not "undefined"', () => {
    const schema = z
      .object({ A: z.string(), B: z.string() })
      .refine((value) => value.A !== value.B, { message: 'A and B must differ' });
    let error: unknown;
    try {
      loadConfig(schema, { A: 'same', B: 'same' });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).variableNames).toEqual(['(configuration)']);
  });
});

describe('loadConfigOrExit', () => {
  it('returns the parsed config when validation succeeds, without exiting', () => {
    const exit = vi.fn();
    const config = loadConfigOrExit(baseConfigSchema, {}, exit as never);
    expect(config.NODE_ENV).toBe('development');
    expect(exit).not.toHaveBeenCalled();
  });

  it('calls exit(1) and reports only the variable name, never its value, on failure', () => {
    const schema = z.object({ REQUIRED_VAR: z.string() });
    const exit = vi.fn();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    loadConfigOrExit(schema, {}, exit as never);
    expect(exit).toHaveBeenCalledWith(1);
    const loggedText = errorSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(loggedText).toContain('REQUIRED_VAR');
    errorSpy.mockRestore();
  });
});
