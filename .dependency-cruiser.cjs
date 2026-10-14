/**
 * Module boundary rules from specs/ARCHITECTURE.md section 4.
 * Scans apps/ and packages/ only; tools/fixtures/arch-violation is a
 * deliberately-broken fixture used to prove this config is active, so it
 * is never included in the real scan.
 */
const INFRA_PACKAGES = ['fastify', 'pg', 'ioredis', 'redis', 'kysely', 'undici', 'axios', 'got'];

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Dependency cycles are not allowed anywhere in the workspace.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'shared-imports-nothing-internal',
      severity: 'error',
      comment: '`shared` imports nothing internal (ARCHITECTURE section 4).',
      from: { path: '^packages/shared' },
      to: { path: '^(apps|packages/(core|llm|evals))' },
    },
    {
      name: 'core-imports-shared-only',
      severity: 'error',
      comment: '`core` may import `shared` only; no apps, llm or evals (ARCHITECTURE section 4).',
      from: { path: '^packages/core' },
      to: { path: '^(apps|packages/(llm|evals))' },
    },
    {
      name: 'core-no-infra-dependencies',
      severity: 'error',
      comment:
        '`core` has no Fastify, SQL, Redis or HTTP client dependency (ARCHITECTURE section 4).',
      from: { path: '^packages/core' },
      to: { path: `node_modules/(${INFRA_PACKAGES.join('|')})(/|$)` },
    },
    {
      name: 'llm-imports-core-and-shared-only',
      severity: 'error',
      comment: '`llm` imports `core` ports and `shared` only (ARCHITECTURE section 4).',
      from: { path: '^packages/llm' },
      to: { path: '^(apps|packages/evals)' },
    },
    {
      name: 'evals-no-app-imports',
      severity: 'error',
      comment:
        '`evals` talks to a running server over HTTP, never by importing app modules (ARCHITECTURE section 4).',
      from: { path: '^packages/evals' },
      to: { path: '^apps' },
    },
    {
      name: 'web-imports-shared-only',
      severity: 'error',
      comment: '`web` imports `shared` only (ARCHITECTURE section 4).',
      from: { path: '^apps/web' },
      to: { path: '^(packages/(core|llm|evals)|apps/(server|mock-rail))' },
    },
    {
      name: 'packages-never-import-apps',
      severity: 'error',
      comment: 'No package may depend on a deployable app (ARCHITECTURE section 4).',
      from: { path: '^packages' },
      to: { path: '^apps' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      mainFields: ['main', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.json'],
    },
  },
};
