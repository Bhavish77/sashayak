import { describe, expect, it } from 'vitest';
import { cancelLexicon, confirmLexicon } from './lexicon';

describe('confirmLexicon and cancelLexicon', () => {
  it.each(['yes', 'ok', 'proceed', 'haan', 'theek hai', 'bhej do', 'हाँ', 'ठीक है', 'भेज दो'])(
    'confirmLexicon contains "%s"',
    (phrase) => {
      expect(confirmLexicon).toContain(phrase);
    },
  );

  it.each(['no', 'cancel', 'stop', 'nahi', 'ruko', 'नहीं', 'रद्द'])(
    'cancelLexicon contains "%s"',
    (phrase) => {
      expect(cancelLexicon).toContain(phrase);
    },
  );

  it('has no phrase in both lists', () => {
    const overlap = confirmLexicon.filter((phrase) => cancelLexicon.includes(phrase));
    expect(overlap).toEqual([]);
  });

  it('has no empty or duplicate entries in either list', () => {
    for (const lexicon of [confirmLexicon, cancelLexicon]) {
      expect(lexicon.every((phrase) => phrase.length > 0)).toBe(true);
      expect(new Set(lexicon).size).toBe(lexicon.length);
    }
  });
});
