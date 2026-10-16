import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'apps/*/src/**/*.test.ts',
      'packages/*/src/**/*.test.ts',
      'tools/fixtures/**/*.test.ts',
      'tools/checks/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      // Per-module 90% branch gates (NFR-MAINT-2) are added as each module
      // lands: redaction (T05), audit (T17-T18), ledger (T19), idempotency
      // (T25), policy (T41). Nothing money-related exists yet, so no
      // threshold is enforced in T01/T02.
    },
  },
});
