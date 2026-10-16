/**
 * F05 behavior 3: the typed confirm/cancel phrase lists. Matched exactly
 * (after normalization done by the caller) against the single pending
 * transfer, with zero LLM calls (AC-F05-14).
 */
export const confirmLexicon: readonly string[] = [
  'yes',
  'yeah',
  'yep',
  'confirm',
  'ok',
  'okay',
  'go ahead',
  'proceed',
  'do it',
  'haan',
  'han',
  'ha',
  'ji haan',
  'theek hai',
  'thik hai',
  'kar do',
  'bhej do',
  'ok kar do',
  'हाँ',
  'हां',
  'जी हाँ',
  'ठीक है',
  'कर दो',
  'भेज दो',
];

export const cancelLexicon: readonly string[] = [
  'no',
  'nope',
  'cancel',
  'stop',
  'dont',
  'nahi',
  'nahin',
  'mat bhejo',
  'ruko',
  'नहीं',
  'रुको',
  'मत भेजो',
  'रद्द',
];
