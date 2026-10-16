import { describe, expect, it } from 'vitest';
import { errorCodes } from './errors';
import { assertCatalogComplete, messageCatalog } from './catalog';
import { locales } from './enums';

describe('messageCatalog', () => {
  it('has an errors.<code> key for every error code, in every locale, non-empty', () => {
    for (const code of errorCodes) {
      const key = `errors.${code.toLowerCase()}`;
      expect(messageCatalog[key]).toBeDefined();
      for (const locale of locales) {
        expect(messageCatalog[key]?.[locale]?.length).toBeGreaterThan(0);
      }
    }
  });

  it('assertCatalogComplete passes for the real catalog', () => {
    const requiredKeys = errorCodes.map((code) => `errors.${code.toLowerCase()}`);
    expect(() => assertCatalogComplete(messageCatalog, requiredKeys)).not.toThrow();
  });

  it('assertCatalogComplete throws when a key is missing', () => {
    expect(() => assertCatalogComplete(messageCatalog, ['errors.not_a_real_key'])).toThrow();
  });

  it('assertCatalogComplete throws when a key is missing a locale', () => {
    const incomplete = { 'errors.validation_failed': { en: 'x', hi: 'y' } };
    expect(() => assertCatalogComplete(incomplete, ['errors.validation_failed'])).toThrow(
      /hi-Latn/,
    );
  });
});
