import { AppError, type ProblemJson } from '@sahayak/shared';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

function isBodyTooLargeError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'FST_ERR_CTP_BODY_TOO_LARGE'
  );
}

/**
 * Turns anything a route handler or Fastify itself might throw into the
 * one problem+json shape `API.md` specifies. An error this function does
 * not recognize is unexpected by definition, so it becomes `INTERNAL`
 * with a fixed, generic detail string — never the original error's
 * message, stack, or any of its other properties (AC-F06-12: no stack,
 * SQL or file path ever reaches a response body).
 */
export function mapErrorToProblemJson(error: unknown, requestId: string): ProblemJson {
  if (error instanceof AppError) {
    return error.toProblemJson(requestId);
  }

  if (hasZodFastifySchemaValidationErrors(error)) {
    const fieldErrors = error.validation.map((item) => ({
      path: item.params.issue.path.join('.'),
      message: item.message,
    }));
    return new AppError(
      'VALIDATION_FAILED',
      'One or more fields are invalid.',
      fieldErrors,
    ).toProblemJson(requestId);
  }

  if (isBodyTooLargeError(error)) {
    return new AppError('PAYLOAD_TOO_LARGE', 'Request body exceeds the size limit.').toProblemJson(
      requestId,
    );
  }

  return new AppError('INTERNAL', 'An unexpected error occurred.').toProblemJson(requestId);
}
