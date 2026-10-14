import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

// Proves the `no any without a comment` rule (CLAUDE.md) is actually
// enforced, without the fixture itself polluting the main `pnpm lint` run.
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

describe('eslint no-explicit-any rule (fixture proof)', () => {
  it('reports an error on an undocumented `any`', async () => {
    const result = await execa('eslint', ['--no-ignore', 'tools/fixtures/lint-violation/bad.ts'], {
      cwd: repoRoot,
      preferLocal: true,
      reject: false,
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('no-explicit-any');
  });
});
