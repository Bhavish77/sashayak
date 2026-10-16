import { describe, expect, it } from 'vitest';
import { serviceName } from './index';

describe('@sahayak/audit entry point', () => {
  it('imports without throwing', () => {
    expect(serviceName).toBe('audit');
  });
});
