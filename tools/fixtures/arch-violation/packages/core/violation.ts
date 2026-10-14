// Deliberately violates the "core imports shared only" boundary rule by
// importing a module that, under this fixture's own folder structure,
// matches the ^apps path pattern in .dependency-cruiser.cjs. See
// tools/fixtures/arch-violation.test.ts.
import { createServer } from '../../apps/server/index';

export const violatingUseOfServer = createServer;
