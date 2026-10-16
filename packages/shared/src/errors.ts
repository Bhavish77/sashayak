import { z } from 'zod';

interface ErrorTableEntry {
  status: number;
  title: string;
  messageKey: string;
}

/**
 * Public codes from API.md and internal codes from INTERNAL_API.md, in one
 * table because both use the same problem+json shape. `messageKey` follows
 * `errors.<code lowercased>` and is what the message catalog looks up.
 */
const errorTableSource = {
  // Public (API.md)
  VALIDATION_FAILED: { status: 400, title: 'Validation failed' },
  AUTH_INVALID_CREDENTIALS: { status: 401, title: 'Invalid credentials' },
  AUTH_TOKEN_EXPIRED: { status: 401, title: 'Access token expired' },
  AUTH_REFRESH_INVALID: { status: 401, title: 'Refresh token invalid' },
  AUTH_FORBIDDEN: { status: 403, title: 'Forbidden' },
  NOT_FOUND: { status: 404, title: 'Not found' },
  IDEMPOTENCY_KEY_REQUIRED: { status: 400, title: 'Idempotency key required' },
  IDEMPOTENCY_KEY_REUSED: { status: 422, title: 'Idempotency key reused' },
  IDEMPOTENCY_IN_PROGRESS: { status: 409, title: 'Idempotent request in progress' },
  TRANSFER_EXPIRED: { status: 409, title: 'Transfer expired' },
  TRANSFER_NOT_CONFIRMABLE: { status: 409, title: 'Transfer not confirmable' },
  TRANSFER_NOT_RESOLVABLE: { status: 409, title: 'Transfer not resolvable' },
  TRANSFER_BUSY: { status: 409, title: 'Transfer busy' },
  INSUFFICIENT_FUNDS: { status: 422, title: 'Insufficient funds' },
  LIMIT_EXCEEDED: { status: 422, title: 'Limit exceeded' },
  PIN_REQUIRED: { status: 403, title: 'PIN required' },
  PIN_INVALID: { status: 403, title: 'PIN invalid' },
  PIN_LOCKED: { status: 423, title: 'PIN locked' },
  RATE_LIMITED: { status: 429, title: 'Rate limited' },
  PAYLOAD_TOO_LARGE: { status: 413, title: 'Payload too large' },
  INTERNAL: { status: 500, title: 'Internal error' },
  DEPENDENCY_UNAVAILABLE: { status: 503, title: 'Dependency unavailable' },
  // Internal (INTERNAL_API.md)
  SERVICE_TOKEN_INVALID: { status: 401, title: 'Service token invalid' },
  SERVICE_FORBIDDEN: { status: 403, title: 'Service forbidden' },
  HOLD_VOIDED: { status: 409, title: 'Hold voided' },
  HOLD_STATE_CONFLICT: { status: 409, title: 'Hold state conflict' },
} as const;

export const errorCodes = Object.keys(errorTableSource) as ErrorCode[];
export type ErrorCode = keyof typeof errorTableSource;
export const errorCodeSchema = z.enum(errorCodes as [ErrorCode, ...ErrorCode[]]);

export const errorTable: Record<ErrorCode, ErrorTableEntry> = Object.fromEntries(
  errorCodes.map((code) => [
    code,
    {
      status: errorTableSource[code].status,
      title: errorTableSource[code].title,
      messageKey: `errors.${code.toLowerCase()}`,
    },
  ]),
) as Record<ErrorCode, ErrorTableEntry>;

const fieldErrorSchema = z
  .object({
    path: z.string(),
    message: z.string(),
  })
  .strict();

export const problemJsonSchema = z
  .object({
    type: z.string().url(),
    title: z.string(),
    status: z.number().int(),
    code: errorCodeSchema,
    detail: z.string(),
    request_id: z.string().min(1),
    errors: z.array(fieldErrorSchema),
  })
  .strict();
export type ProblemJson = z.infer<typeof problemJsonSchema>;
