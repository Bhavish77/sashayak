import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

// Proves the "core imports shared only" module boundary rule
// (specs/ARCHITECTURE.md section 4) is actually enforced, by pointing the
// same dependency-cruiser config at a fixture that deliberately breaks it.
// cwd is set to the fixture root so its "packages/core" and "apps/server"
// subfolders resolve to the same path shapes the real rules match against.
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const fixtureRoot = path.join(repoRoot, 'tools/fixtures/arch-violation');

describe('dependency-cruiser boundary rules (fixture proof)', () => {
  it('reports an error on a core -> apps/server import', async () => {
    const result = await execa(
      'depcruise',
      ['--config', path.join(repoRoot, '.dependency-cruiser.cjs'), '.'],
      { cwd: fixtureRoot, preferLocal: true, reject: false },
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('core-imports-shared-only');
  });
});
