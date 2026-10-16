// Deliberately violates "`assistant-core` has no Fastify, SQL, Redis or
// HTTP client dependency" (ARCHITECTURE section 4). The `fastify` import
// resolves to a tiny local stub under this fixture's own node_modules (see
// ../../node_modules/fastify), not a real dependency of the workspace.
// See tools/fixtures/arch-violations.test.ts.
import fastify from 'fastify';

export const violatingUseOfFastify = fastify;
