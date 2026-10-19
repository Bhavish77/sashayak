import { z } from 'zod';

/**
 * F07/EVENTS.md: timestamps that feed the audit hash chain must have one
 * spelling per instant (`YYYY-MM-DDTHH:mm:ss.sssZ`, UTC, exactly three
 * fractional digits), or the writer and the verifier could hash two
 * different strings for the same moment.
 */
export const isoTimestampSchema = z.string().datetime({ precision: 3, offset: false });
