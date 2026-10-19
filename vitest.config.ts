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
      // Per-module 90% branch gates (NFR-MAINT-2), added as each module
      // lands: redaction (T05, below), audit (T17-T18), ledger (T19),
      // idempotency (T25), policy (T41).
      thresholds: {
        'packages/shared/src/redaction/**': {
          branches: 90,
        },
      },
    },
  },
});
