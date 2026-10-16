import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Reads the command list straight from the spec so this test can never
// silently drift from it: every `pnpm <name>` backtick span in
// specs/TESTING.md section 8 must be a real root script.
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

function extractPnpmScriptNames(testingMd: string): string[] {
  const sectionStart = testingMd.indexOf('## 8. Verification commands');
  const sectionEnd = testingMd.indexOf('## 9.', sectionStart);
  const section = testingMd.slice(sectionStart, sectionEnd);

  const names = new Set<string>();
  for (const match of section.matchAll(/`pnpm ([^ `]+)/g)) {
    names.add(match[1]);
  }
  return [...names];
}

describe('root package.json scripts', () => {
  it('defines every pnpm command named in specs/TESTING.md section 8', async () => {
    const [testingMd, packageJson] = await Promise.all([
      readFile(path.join(repoRoot, 'specs/TESTING.md'), 'utf8'),
      readFile(path.join(repoRoot, 'package.json'), 'utf8'),
    ]);

    const required = extractPnpmScriptNames(testingMd);
    expect(required.length).toBeGreaterThan(0);

    const scripts = JSON.parse(packageJson).scripts as Record<string, string>;
    const missing = required.filter((name) => !(name in scripts));

    expect(missing).toEqual([]);
  });
});
