// Deliberately violates "an app never imports another app"
// (ARCHITECTURE section 4 / ADR-015). See
// tools/fixtures/arch-violations.test.ts.
import { createEdge } from '../edge/index';

export const violatingUseOfEdge = createEdge;
