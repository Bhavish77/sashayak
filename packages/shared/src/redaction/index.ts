// Public API only — patterns.ts stays internal: callers depend on what
// redaction does, not on the exact regexes doing it.
export { redactText } from './redact-text';
export { maskAccount } from './mask-account';
export { redactObject } from './redact-object';
export { pinoRedactionSerializer, redactSpanAttributes } from './serializers';
