/**
 * Module boundary rules from specs/ARCHITECTURE.md section 4 (ADR-015).
 * Scans apps/ and packages/ only; tools/fixtures/arch-violations holds
 * deliberately-broken fixtures used to prove this config is active, so it
 * is never included in the real scan.
 */
const APPS = ['edge', 'assistant', 'wallet', 'transfers', 'audit'];
const INFRA_PACKAGES = ['fastify', 'pg', 'ioredis', 'redis', 'kysely', 'undici', 'axios', 'got'];

const appNeverImportsAnotherApp = APPS.map((app) => ({
  name: `${app}-never-imports-another-app`,
  severity: 'error',
  comment: 'An app may import packages but never another app (ARCHITECTURE section 4).',
  from: { path: `^apps/${app}/` },
  to: { path: `^apps/(${APPS.filter((other) => other !== app).join('|')})/` },
}));

const domainImportsSharedOnly = APPS.map((app) => ({
  name: `${app}-domain-imports-shared-only`,
  severity: 'error',
  comment:
    '`domain` imports `shared` only; never `app`, `adapters`, `main` or another package (ARCHITECTURE section 4).',
  from: { path: `^apps/${app}/src/domain` },
  to: {
    path: `^(apps/${app}/src/(app|adapters|main)|packages/(platform|assistant-core|llm|evals))`,
  },
}));

const mainIsNeverImported = APPS.map((app) => ({
  name: `${app}-main-is-never-imported`,
  severity: 'error',
  comment: '`main` is the only composition root; nothing else imports it (ARCHITECTURE section 4).',
  from: { path: `^apps/${app}/src/(domain|app|adapters)` },
  to: { path: `^apps/${app}/src/main` },
}));

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
      comment: '`shared` imports nothing internal and has no I/O (ARCHITECTURE section 4).',
      from: { path: '^packages/shared' },
      to: { path: '^(apps|packages/(platform|assistant-core|llm|evals))' },
    },
    {
      name: 'platform-imports-shared-only',
      severity: 'error',
      comment: '`platform` imports `shared` only (ARCHITECTURE section 4).',
      from: { path: '^packages/platform' },
      to: { path: '^(apps|packages/(assistant-core|llm|evals))' },
    },
    {
      name: 'assistant-core-imports-shared-only',
      severity: 'error',
      comment: '`assistant-core` imports `shared` only; it is pure (ARCHITECTURE section 4).',
      from: { path: '^packages/assistant-core' },
      to: { path: '^(apps|packages/(platform|llm|evals))' },
    },
    {
      name: 'assistant-core-no-infra-dependencies',
      severity: 'error',
      comment:
        '`assistant-core` has no Fastify, SQL, Redis or HTTP client dependency (ARCHITECTURE section 4).',
      from: { path: '^packages/assistant-core' },
      to: { path: `node_modules/(${INFRA_PACKAGES.join('|')})(/|$)` },
    },
    {
      name: 'llm-imports-shared-and-platform-only',
      severity: 'error',
      comment: '`llm` imports `shared` and `platform` only (ARCHITECTURE section 4).',
      from: { path: '^packages/llm' },
      to: { path: '^(apps|packages/(assistant-core|evals))' },
    },
    {
      name: 'evals-no-app-imports',
      severity: 'error',
      comment:
        '`evals` talks to a running stack through `edge` over HTTP, never by importing app modules (ARCHITECTURE section 4).',
      from: { path: '^packages/evals' },
      to: { path: '^apps' },
    },
    {
      name: 'web-imports-shared-only',
      severity: 'error',
      comment: '`web` imports `shared` only (ARCHITECTURE section 4).',
      from: { path: '^apps/web' },
      to: {
        path: `^(packages/(platform|assistant-core|llm|evals)|apps/(${APPS.join('|')}|mock-rail))`,
      },
    },
    {
      name: 'packages-never-import-apps',
      severity: 'error',
      comment: 'No package may depend on a deployable app (ARCHITECTURE section 4).',
      from: { path: '^packages' },
      to: { path: '^apps' },
    },
    ...appNeverImportsAnotherApp,
    ...domainImportsSharedOnly,
    ...mainIsNeverImported,
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
