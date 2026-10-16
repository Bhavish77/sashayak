import { z } from 'zod';

/** ARCHITECTURE.md section 6.2. */
export const transferStatuses = [
  'PREPARED',
  'CONFIRMED',
  'HOLD_PLACED',
  'SUBMITTED',
  'SETTLING',
  'RELEASING',
  'COMPLETED',
  'FAILED',
  'PENDING_UNKNOWN',
  'NEEDS_REVIEW',
  'CANCELLED',
  'EXPIRED',
] as const;
export const transferStatusSchema = z.enum(transferStatuses);
export type TransferStatus = z.infer<typeof transferStatusSchema>;

/** ARCHITECTURE.md section 6.1. */
export const holdStates = ['HELD', 'SETTLED', 'RELEASED', 'REJECTED', 'VOIDED'] as const;
export const holdStateSchema = z.enum(holdStates);
export type HoldState = z.infer<typeof holdStateSchema>;

/** F03: the closed intent set. Anything else is invalid interpreter output. */
export const intents = [
  'CHECK_BALANCE',
  'LIST_TRANSACTIONS',
  'TRANSACTION_STATUS',
  'TRANSFER_MONEY',
  'NAVIGATE',
  'FAQ_SUPPORT',
  'CREATE_TICKET',
  'SMALL_TALK',
  'OUT_OF_SCOPE',
] as const;
export const intentSchema = z.enum(intents);
export type Intent = z.infer<typeof intentSchema>;

/** F03: language / reply locale. */
export const locales = ['en', 'hi', 'hi-Latn'] as const;
export const localeSchema = z.enum(locales);
export type Locale = z.infer<typeof localeSchema>;

/** DATA_MODEL.md edge_db.users.role. */
export const roles = ['customer', 'support', 'admin'] as const;
export const roleSchema = z.enum(roles);
export type Role = z.infer<typeof roleSchema>;

/** F04: the navigation screen allowlist. */
export const screens = [
  'home',
  'transactions',
  'send_money',
  'beneficiaries',
  'add_beneficiary',
  'profile',
  'limits',
  'support',
] as const;
export const screenSchema = z.enum(screens);
export type Screen = z.infer<typeof screenSchema>;

/** API.md: the Transfer object's failure_code enum. */
export const failureCodes = [
  'INSUFFICIENT_FUNDS',
  'HOLD_REJECTED',
  'RAIL_REJECTED',
  'RAIL_INVALID',
  'ADMIN_RESOLVED',
] as const;
export const failureCodeSchema = z.enum(failureCodes);
export type FailureCode = z.infer<typeof failureCodeSchema>;

/** API.md: card types carried on a Message. */
export const cardTypes = [
  'balance',
  'transactions',
  'transfer_confirmation',
  'transfer_status',
  'navigation',
  'menu',
  'faq',
  'ticket',
] as const;
export const cardTypeSchema = z.enum(cardTypes);
export type CardType = z.infer<typeof cardTypeSchema>;

/** DATA_MODEL.md assistant_db.messages.role. */
export const messageRoles = ['user', 'assistant', 'system_notice'] as const;
export const messageRoleSchema = z.enum(messageRoles);
export type MessageRole = z.infer<typeof messageRoleSchema>;

/** F03: direction of a transaction, used in entity extraction and history filters. */
export const directions = ['credit', 'debit'] as const;
export const directionSchema = z.enum(directions);
export type Direction = z.infer<typeof directionSchema>;

/** F03: `date_range.relative` values. */
export const dateRangeRelatives = [
  'today',
  'yesterday',
  'day_before_yesterday',
  'this_week',
  'last_week',
  'last_7_days',
  'this_month',
  'last_month',
  'custom',
] as const;
export const dateRangeRelativeSchema = z.enum(dateRangeRelatives);
export type DateRangeRelative = z.infer<typeof dateRangeRelativeSchema>;

/** ADR-015: the five application services (excludes mock-rail and web, which are not event producers or internal-route callees). */
export const serviceNames = ['edge', 'assistant', 'wallet', 'transfers', 'audit'] as const;
export const serviceNameSchema = z.enum(serviceNames);
export type ServiceName = z.infer<typeof serviceNameSchema>;

/** DATA_MODEL.md audit_log.result. */
export const auditResults = ['success', 'denied', 'error'] as const;
export const auditResultSchema = z.enum(auditResults);
export type AuditResult = z.infer<typeof auditResultSchema>;

/** F07 "What is recorded": the closed list of audit.recorded action strings. */
export const auditActions = [
  'auth.login.success',
  'auth.login.failure',
  'auth.refresh',
  'auth.refresh_reuse_detected',
  'auth.logout',
  'auth.pin.failure',
  'auth.pin.locked',
  'auth.pin.changed',
  'assistant.action',
  'policy.denied',
  'output_guard.blocked',
  'ticket.created',
  'transfer.prepared',
  'transfer.confirmed',
  'transfer.hold_placed',
  'transfer.submitted',
  'transfer.settling',
  'transfer.releasing',
  'transfer.completed',
  'transfer.failed',
  'transfer.pending_unknown',
  'transfer.needs_review',
  'transfer.cancelled',
  'transfer.expired',
  'transfer.resolved',
  'wallet.hold_placed',
  'wallet.hold_rejected',
  'wallet.hold_settled',
  'wallet.hold_released',
  'wallet.hold_voided',
  'beneficiary.created',
  'admin.view_conversation',
  'admin.unmask',
  'admin.view_llm_calls',
  'admin.view_tickets',
  'admin.view_transfer',
  'admin.reconcile',
  'admin.resolve',
  'admin.view_audit',
  'audit.verify',
] as const;
export const auditActionSchema = z.enum(auditActions);
export type AuditAction = z.infer<typeof auditActionSchema>;
