// Deliberately forms a cycle with b.ts to prove the no-circular rule
// (see tools/fixtures/arch-violations.test.ts).
import { b } from './b';

export const a = (): string => `a -> ${b()}`;
