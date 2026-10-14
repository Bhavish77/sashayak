import { describe, expect, it } from 'vitest';
import { packageName } from './index';

describe('@sahayak/mock-rail entry point', () => {
  it('imports without throwing', () => {
    expect(packageName).toBe('@sahayak/mock-rail');
  });
});
