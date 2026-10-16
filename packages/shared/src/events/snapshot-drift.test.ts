import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { auditRecordedV1PayloadSchema, transferStatusChangedV1PayloadSchema } from './catalog';
import { assertShapeCompatible, objectShapeSnapshot, type FieldShape } from './shape-snapshot';

const snapshotsDir = fileURLToPath(new URL('./__snapshots__', import.meta.url));

function readSnapshot(fileName: string): Record<string, FieldShape> {
  return JSON.parse(readFileSync(path.join(snapshotsDir, fileName), 'utf8'));
}

// AC-F10-8 applied to the real catalog: the committed snapshots were
// generated from these same schemas (there is no meaningful "red" state
// for a golden-master comparison like this one); the genuine red/green
// proof of the comparison mechanism itself is in shape-snapshot.test.ts.
describe('event schema snapshot drift (AC-F10-8)', () => {
  it('audit.recorded v1 payload matches its committed snapshot', () => {
    const baseline = readSnapshot('audit.recorded.v1.json');
    const current = objectShapeSnapshot(auditRecordedV1PayloadSchema);
    expect(() => assertShapeCompatible(baseline, current)).not.toThrow();
    expect(current).toEqual(baseline);
  });

  it('transfer.status_changed v1 payload matches its committed snapshot', () => {
    const baseline = readSnapshot('transfer.status_changed.v1.json');
    const current = objectShapeSnapshot(transferStatusChangedV1PayloadSchema);
    expect(() => assertShapeCompatible(baseline, current)).not.toThrow();
    expect(current).toEqual(baseline);
  });
});
