import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

// Proves the module boundary rules from specs/ARCHITECTURE.md section 4
// (ADR-015) are actually enforced, by pointing the same dependency-cruiser
// config at fixtures that deliberately break each rule. cwd is set to each
// fixture's own root so its "apps/edge", "apps/assistant", etc. subfolders
// resolve to the same path shapes the real rules match against.
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const configPath = path.join(repoRoot, '.dependency-cruiser.cjs');
const fixturesRoot = path.join(repoRoot, 'tools/fixtures/arch-violations');

async function cruiseFixture(fixtureName: string) {
  return execa('depcruise', ['--config', configPath, '.'], {
    cwd: path.join(fixturesRoot, fixtureName),
    preferLocal: true,
    reject: false,
  });
}

// Each test here shells out to a real depcruise process rather than
// calling a mock, so its wall-clock time depends on however busy the
// machine already is, not just on this test's own work. Vitest's default
// 5 s per-test timeout has no margin for that under load (observed:
// failed 3 times running alongside the full suite, passed every time run
// alone at 2.4-2.8 s) — 30 s leaves plenty of room without masking a
// genuinely hung process.
const TIMEOUT_MS = 30_000;

describe('dependency-cruiser boundary rules (fixture proof)', () => {
  it(
    'reports an error when one app imports another app',
    async () => {
      const result = await cruiseFixture('app-imports-app');

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('wallet-never-imports-another-app');
    },
    TIMEOUT_MS,
  );

  it(
    'reports an error when domain imports an adapters module',
    async () => {
      const result = await cruiseFixture('domain-imports-adapters');

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('assistant-domain-imports-shared-only');
    },
    TIMEOUT_MS,
  );

  it(
    'reports an error when assistant-core imports Fastify',
    async () => {
      const result = await cruiseFixture('assistant-core-imports-infra');

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('assistant-core-no-infra-dependencies');
    },
    TIMEOUT_MS,
  );

  it(
    'reports an error when shared imports another package',
    async () => {
      const result = await cruiseFixture('shared-imports-package');

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('shared-imports-nothing-internal');
    },
    TIMEOUT_MS,
  );

  it(
    'reports an error on a dependency cycle',
    async () => {
      const result = await cruiseFixture('cycle');

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('no-circular');
    },
    TIMEOUT_MS,
  );
});
