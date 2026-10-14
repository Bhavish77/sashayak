// Deliberately violates @typescript-eslint/no-explicit-any with no
// justifying comment. Excluded from the main `pnpm lint` run (see
// eslint.config.js and .prettierignore); linted directly by
// tools/fixtures/lint-violation.test.ts to prove the rule is active.
export function unsafeIdentity(value: any): any {
  return value;
}
