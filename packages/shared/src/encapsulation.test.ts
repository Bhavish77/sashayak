import { describe, expect, it } from 'vitest';
import { packageName } from './index';

// T03 Done-when: "package exports are the only way other packages see
// these types." package.json's "exports" map restricts the package to a
// single "." entry, so another workspace package reaching in with a deep
// import (as opposed to a relative import from within this same package,
// which is unaffected) must fail to resolve.
describe('@sahayak/shared encapsulation', () => {
  it('exposes its barrel export', () => {
    expect(packageName).toBe('@sahayak/shared');
  });

  it('refuses a deep import from outside the package', async () => {
    // Built at runtime, not a literal, so the bundler cannot pre-resolve
    // (and hard-fail on) it at transform time — the point here is to
    // observe the rejection as a catchable runtime error, which is what a
    // consumer package's own bundler would also see.
    const deepSpecifier = ['@sahayak/shared', 'src', 'money'].join('/');
    await expect(import(deepSpecifier)).rejects.toThrow();
  });
});
