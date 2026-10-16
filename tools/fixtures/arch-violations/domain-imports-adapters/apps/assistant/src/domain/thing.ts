// Deliberately violates "`domain` imports `shared` only"
// (ARCHITECTURE section 4). See tools/fixtures/arch-violations.test.ts.
import { somePort } from '../adapters/other';

export const violatingUseOfAdapter = somePort;
