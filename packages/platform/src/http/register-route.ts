import { AppError, type PublicRouteDef } from '@sahayak/shared';
import type { z } from 'zod';
import type { AppInstance } from './app';

/**
 * Registration-time policy every route must declare (F10: "Registering a
 * route requires `{ roles, ownership }`... startup fails otherwise").
 * `roles` already lives on `PublicRouteDef` itself; `ownership` is
 * whether the route needs a per-resource ownership check. The actual
 * role and ownership *enforcement* needs a verified user on the request
 * (T11's auth kit, not built yet) — this is the startup-time guard
 * (AC-F10-4, part) that a route cannot be registered without declaring
 * the policy at all.
 */
export interface RoutePolicy {
  ownership: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The one key present in more than one of the three sources, or `undefined` if there is no overlap. */
function findRepeatedKey(
  pathKeys: string[],
  queryKeys: string[],
  bodyKeys: string[],
): string | undefined {
  const seen = new Set<string>();
  for (const key of [...pathKeys, ...queryKeys, ...bodyKeys]) {
    if (seen.has(key)) {
      return key;
    }
    seen.add(key);
  }
  return undefined;
}

/**
 * Registers one route on an app built by `createApps`, wiring together
 * what F10's "service skeleton" capability describes in one place:
 *
 * - **Policy required** (AC-F10-4, part): throws at registration —
 *   meaning the service never finishes starting — if `roles` or
 *   `ownership` was not given.
 * - **Request assembly** (AC-F10-19): path parameters, query and body
 *   are merged into one object before validation. A key present in more
 *   than one of them is rejected with `VALIDATION_FAILED` before the
 *   handler runs — never silently resolved by object-spread precedence,
 *   which would let a body field quietly overrule a path segment (a
 *   caller repeating `id` in both places, hoping the handler reads the
 *   one it controls). A key the route's own schema does not list is
 *   rejected the same way, by the schema's own `.strict()` mode.
 *
 * `handler` receives the merged, schema-validated input directly — never
 * Fastify's separate `params`/`query`/`body`.
 */
export function registerRoute<Request extends z.ZodTypeAny, Response extends z.ZodTypeAny>(
  app: AppInstance,
  route: PublicRouteDef<Request, Response>,
  policy: RoutePolicy,
  handler: (input: z.infer<Request>) => Promise<z.infer<Response>>,
): void {
  if (!route.roles) {
    throw new Error(`Route ${route.method} ${route.path} is missing a "roles" policy`);
  }
  if (typeof policy.ownership !== 'boolean') {
    throw new Error(
      `Route ${route.method} ${route.path} is missing an explicit "ownership" policy`,
    );
  }

  app.route({
    method: route.method,
    url: route.path,
    handler: async (request, reply) => {
      const pathParams = isPlainObject(request.params) ? request.params : {};
      const query = isPlainObject(request.query) ? request.query : {};
      const body = isPlainObject(request.body) ? request.body : {};

      const repeatedKey = findRepeatedKey(
        Object.keys(pathParams),
        Object.keys(query),
        Object.keys(body),
      );
      if (repeatedKey !== undefined) {
        throw new AppError('VALIDATION_FAILED', 'One or more fields are invalid.', [
          { path: repeatedKey, message: 'present in more than one of path, query and body' },
        ]);
      }

      const merged = { ...pathParams, ...query, ...body };
      const result = route.request.safeParse(merged);
      if (!result.success) {
        const fieldErrors = result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));
        throw new AppError('VALIDATION_FAILED', 'One or more fields are invalid.', fieldErrors);
      }

      const output = await handler(result.data);
      reply.send(output);
    },
  });
}
