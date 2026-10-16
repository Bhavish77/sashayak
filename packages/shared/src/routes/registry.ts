import { z } from 'zod';
import type { Role, ServiceName } from '../enums';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface RouteDef<Request extends z.ZodTypeAny, Response extends z.ZodTypeAny> {
  method: HttpMethod;
  path: string;
  request: Request;
  response: Response;
}

export interface PublicRouteDef<
  Request extends z.ZodTypeAny,
  Response extends z.ZodTypeAny,
> extends RouteDef<Request, Response> {
  roles: Role[] | 'public' | 'any';
}

export interface InternalRouteDef<
  Request extends z.ZodTypeAny,
  Response extends z.ZodTypeAny,
> extends RouteDef<Request, Response> {
  callee: ServiceName;
  callers: ServiceName[];
}

/** A thin identity helper: its only job is type inference at the call site. */
export function definePublicRoute<Request extends z.ZodTypeAny, Response extends z.ZodTypeAny>(
  def: PublicRouteDef<Request, Response>,
): PublicRouteDef<Request, Response> {
  return def;
}

export function defineInternalRoute<Request extends z.ZodTypeAny, Response extends z.ZodTypeAny>(
  def: InternalRouteDef<Request, Response>,
): InternalRouteDef<Request, Response> {
  return def;
}

/**
 * The shape a real transport (built later in `platform`/service adapters)
 * must implement. `shared` has no I/O of its own (ARCHITECTURE section 4);
 * this type only describes what a caller plugs in. The caller's
 * parameter is the *input* type (pre-defaults, e.g. `cursor` may be
 * omitted), while the handler below receives the *parsed* output type
 * (defaults already applied).
 */
export type RouteClient<Request extends z.ZodTypeAny, Response extends z.ZodTypeAny> = (
  input: z.input<Request>,
) => Promise<z.infer<Response>>;

/**
 * An in-memory fake generated from a route's own schemas: validates the
 * input before calling the handler and the handler's output before
 * returning it, so a deliberately mutated schema makes both a
 * provider-style test (bad handler output) and a consumer-style test
 * (bad caller input) fail (AC-F10-7).
 */
export function createRouteFake<Request extends z.ZodTypeAny, Response extends z.ZodTypeAny>(
  route: Pick<RouteDef<Request, Response>, 'request' | 'response'>,
  handler: (input: z.infer<Request>) => z.infer<Response> | Promise<z.infer<Response>>,
): RouteClient<Request, Response> {
  return async (input) => {
    const validatedInput = route.request.parse(input);
    const result = await handler(validatedInput);
    return route.response.parse(result);
  };
}
