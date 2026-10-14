import { describe, expect, it } from 'vitest';
import { packageName } from './index';

describe('@sahayak/llm entry point', () => {
  it('imports without throwing', () => {
    expect(packageName).toBe('@sahayak/llm');
  });
});
