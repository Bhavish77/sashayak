import { describe, expect, it } from 'vitest';
import { serviceName } from './index';

describe('@sahayak/wallet entry point', () => {
  it('imports without throwing', () => {
    expect(serviceName).toBe('wallet');
  });
});
