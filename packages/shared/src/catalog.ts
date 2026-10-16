import { errorCodes, type ErrorCode } from './errors';
import { locales, type Locale } from './enums';

export type MessageCatalog = Record<string, Partial<Record<Locale, string>>>;

/**
 * Fails loudly (not silently) when a required key is missing, or present
 * but missing a locale. Used by this file's own test and reused by later
 * message-catalog growth (F03 AC-F03-11: "a test fails if a key lacks a
 * locale").
 */
export function assertCatalogComplete(catalog: MessageCatalog, requiredKeys: string[]): void {
  for (const key of requiredKeys) {
    const entry = catalog[key];
    if (!entry) {
      throw new Error(`Message catalog is missing key "${key}"`);
    }
    for (const locale of locales) {
      if (!entry[locale]) {
        throw new Error(`Message catalog key "${key}" is missing locale "${locale}"`);
      }
    }
  }
}

/**
 * NOTE (ADR-013, CLAUDE.md known limits): the Hindi and Hinglish wording
 * below is a best-effort first draft written by the implementer, not a
 * fluent speaker. It must be reviewed before any real use. Its only job
 * right now is to prove the catalog mechanism (every key, every locale)
 * works; later tasks add the many more keys real templates need.
 */
const errorMessages: Record<ErrorCode, { en: string; hi: string; 'hi-Latn': string }> = {
  VALIDATION_FAILED: {
    en: 'Some details are not valid.',
    hi: 'कुछ जानकारी सही नहीं है।',
    'hi-Latn': 'Kuch details sahi nahi hain.',
  },
  AUTH_INVALID_CREDENTIALS: {
    en: 'Incorrect email or password.',
    hi: 'ईमेल या पासवर्ड गलत है।',
    'hi-Latn': 'Email ya password galat hai.',
  },
  AUTH_TOKEN_EXPIRED: {
    en: 'Your session has expired. Please log in again.',
    hi: 'आपका सेशन समाप्त हो गया है। कृपया फिर से लॉगिन करें।',
    'hi-Latn': 'Aapka session khatam ho gaya hai. Dobara login karein.',
  },
  AUTH_REFRESH_INVALID: {
    en: 'Please log in again.',
    hi: 'कृपया फिर से लॉगिन करें।',
    'hi-Latn': 'Please dobara login karein.',
  },
  AUTH_FORBIDDEN: {
    en: "You don't have access to this.",
    hi: 'आपको इसकी अनुमति नहीं है।',
    'hi-Latn': 'Aapko iski permission nahi hai.',
  },
  NOT_FOUND: {
    en: "We couldn't find that.",
    hi: 'यह नहीं मिला।',
    'hi-Latn': 'Yeh nahi mila.',
  },
  IDEMPOTENCY_KEY_REQUIRED: {
    en: 'This request needs an idempotency key.',
    hi: 'इस रिक्वेस्ट के लिए idempotency key ज़रूरी है।',
    'hi-Latn': 'Is request ke liye idempotency key zaroori hai.',
  },
  IDEMPOTENCY_KEY_REUSED: {
    en: 'This key was already used for a different request.',
    hi: 'यह key पहले से एक अलग रिक्वेस्ट के लिए इस्तेमाल हो चुकी है।',
    'hi-Latn': 'Yeh key pehle hi ek alag request ke liye use ho chuki hai.',
  },
  IDEMPOTENCY_IN_PROGRESS: {
    en: 'The first request with this key is still being processed.',
    hi: 'इस key वाली पहली रिक्वेस्ट अभी भी प्रोसेस हो रही है।',
    'hi-Latn': 'Is key wali pehli request abhi process ho rahi hai.',
  },
  TRANSFER_EXPIRED: {
    en: 'This transfer has expired. Please prepare it again.',
    hi: 'यह ट्रांसफर समय-सीमा पार कर गया है। कृपया फिर से तैयार करें।',
    'hi-Latn': 'Yeh transfer expire ho gaya hai. Phir se prepare karein.',
  },
  TRANSFER_NOT_CONFIRMABLE: {
    en: 'This transfer can no longer be confirmed.',
    hi: 'यह ट्रांसफर अब कन्फर्म नहीं किया जा सकता।',
    'hi-Latn': 'Yeh transfer ab confirm nahi ho sakta.',
  },
  TRANSFER_NOT_RESOLVABLE: {
    en: "This transfer can't be resolved right now.",
    hi: 'यह ट्रांसफर अभी हल नहीं किया जा सकता।',
    'hi-Latn': 'Yeh transfer abhi resolve nahi ho sakta.',
  },
  TRANSFER_BUSY: {
    en: 'This transfer is being processed. Please try again shortly.',
    hi: 'यह ट्रांसफर प्रोसेस हो रहा है। कृपया थोड़ी देर बाद कोशिश करें।',
    'hi-Latn': 'Yeh transfer process ho raha hai. Thodi der baad try karein.',
  },
  INSUFFICIENT_FUNDS: {
    en: 'Your available balance is lower than this amount.',
    hi: 'आपका उपलब्ध बैलेंस इस राशि से कम है।',
    'hi-Latn': 'Aapka available balance is amount se kam hai.',
  },
  LIMIT_EXCEEDED: {
    en: 'This is above your transfer limit.',
    hi: 'यह आपकी ट्रांसफर सीमा से अधिक है।',
    'hi-Latn': 'Yeh aapki transfer limit se zyada hai.',
  },
  PIN_REQUIRED: {
    en: 'Please enter your PIN to continue.',
    hi: 'जारी रखने के लिए अपना पिन डालें।',
    'hi-Latn': 'Aage badhne ke liye apna PIN daalein.',
  },
  PIN_INVALID: {
    en: 'That PIN is incorrect.',
    hi: 'यह पिन सही नहीं है।',
    'hi-Latn': 'Yeh PIN sahi nahi hai.',
  },
  PIN_LOCKED: {
    en: 'Too many wrong attempts. Your PIN is locked for a while.',
    hi: 'बहुत बार गलत प्रयास। आपका पिन कुछ समय के लिए लॉक है।',
    'hi-Latn': 'Bahut baar galat koshish hui. Aapka PIN thodi der ke liye lock hai.',
  },
  RATE_LIMITED: {
    en: 'Too many requests. Please slow down.',
    hi: 'बहुत अधिक रिक्वेस्ट। कृपया थोड़ा धीमा करें।',
    'hi-Latn': 'Bahut zyada requests. Thoda slow karein.',
  },
  PAYLOAD_TOO_LARGE: {
    en: 'That message is too long.',
    hi: 'यह मैसेज बहुत लंबा है।',
    'hi-Latn': 'Yeh message bahut lamba hai.',
  },
  INTERNAL: {
    en: 'Something went wrong on our end.',
    hi: 'हमारी तरफ से कुछ गड़बड़ हो गई।',
    'hi-Latn': 'Hamari taraf se kuch gadbad ho gayi.',
  },
  DEPENDENCY_UNAVAILABLE: {
    en: 'This part of the service is temporarily unavailable.',
    hi: 'सेवा का यह हिस्सा अभी उपलब्ध नहीं है।',
    'hi-Latn': 'Service ka yeh hissa abhi available nahi hai.',
  },
  SERVICE_TOKEN_INVALID: {
    en: 'Internal service authentication failed.',
    hi: 'इंटरनल सर्विस प्रमाणीकरण विफल हुआ।',
    'hi-Latn': 'Internal service authentication fail ho gaya.',
  },
  SERVICE_FORBIDDEN: {
    en: 'This internal service call is not allowed.',
    hi: 'यह इंटरनल सर्विस कॉल की अनुमति नहीं है।',
    'hi-Latn': 'Yeh internal service call allowed nahi hai.',
  },
  HOLD_VOIDED: {
    en: 'This hold was already cancelled.',
    hi: 'यह होल्ड पहले ही रद्द हो चुका है।',
    'hi-Latn': 'Yeh hold pehle hi cancel ho chuka hai.',
  },
  HOLD_STATE_CONFLICT: {
    en: "This hold is in a state that doesn't allow that action.",
    hi: 'यह होल्ड ऐसी स्थिति में है जहाँ यह कार्रवाई संभव नहीं है।',
    'hi-Latn': 'Yeh hold aisi state mein hai jahan yeh action possible nahi hai.',
  },
};

export const messageCatalog: MessageCatalog = Object.fromEntries(
  errorCodes.map((code) => [`errors.${code.toLowerCase()}`, errorMessages[code]]),
);
