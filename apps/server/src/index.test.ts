import { describe, expect, it } from 'vitest';
import { packageName } from './index';

describe('@sahayak/server entry point', () => {
  it('imports without throwing', () => {
    expect(packageName).toBe('@sahayak/server');
  });
});
