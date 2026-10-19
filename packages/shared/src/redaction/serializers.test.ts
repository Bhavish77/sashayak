import { describe, expect, it } from 'vitest';
import { pinoRedactionSerializer, redactSpanAttributes } from './serializers';

describe('pinoRedactionSerializer', () => {
  it('deep-redacts whatever object is passed to it, pino-style', () => {
    const result = pinoRedactionSerializer({ email: 'aarav@example.com', pin: '1234' }) as Record<
      string,
      unknown
    >;
    expect(result.email).toBe('[EMAIL]');
    expect(result.pin).toBe('[REDACTED]');
  });

  it('passes a plain string through redactText', () => {
    expect(pinoRedactionSerializer('call 9876543210')).toContain('[PHONE]');
  });
});

describe('redactSpanAttributes', () => {
  it('redacts string attribute values', () => {
    const result = redactSpanAttributes({
      'user.email': 'aarav@example.com',
      'http.method': 'GET',
    });
    expect(result['user.email']).toBe('[EMAIL]');
    expect(result['http.method']).toBe('GET');
  });

  it('leaves number and boolean attribute values untouched', () => {
    const result = redactSpanAttributes({ 'http.status_code': 200, 'retry.enabled': true });
    expect(result['http.status_code']).toBe(200);
    expect(result['retry.enabled']).toBe(true);
  });

  it('redacts each string inside an array attribute value', () => {
    const result = redactSpanAttributes({ contacts: ['aarav@example.com', 'no-match'] });
    expect(result.contacts).toEqual(['[EMAIL]', 'no-match']);
  });

  it('leaves non-string elements inside an array attribute value untouched', () => {
    const result = redactSpanAttributes({ 'retry.delays_ms': [100, 200, 400] });
    expect(result['retry.delays_ms']).toEqual([100, 200, 400]);
  });

  it('never throws on an empty attributes object', () => {
    expect(() => redactSpanAttributes({})).not.toThrow();
  });
});
