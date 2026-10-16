// Deliberately violates "`shared` imports nothing internal"
// (ARCHITECTURE section 4). See tools/fixtures/arch-violations.test.ts.
import { somePlatformHelper } from '../platform/thing';

export const violatingUseOfPlatform = somePlatformHelper;
