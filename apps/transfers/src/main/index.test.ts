import { describe, expect, it } from 'vitest';
import { serviceName } from './index';

describe('@sahayak/transfers entry point', () => {
  it('imports without throwing', () => {
    expect(serviceName).toBe('transfers');
  });
});
