# ADR-019: Audit by events, ingested by an independent service

Status: Proposed (2026-10-15). Amends ADR-009.

## Context

ADR-009 wrote the audit entry in the same database transaction as the action, which gave exact atomicity: a committed action always had an entry and a rolled-back one never did. With a database per service, the audit log lives in its own database, so that guarantee cannot hold through one transaction. Calling the audit service from inside a business transaction would put a remote call in a transaction and would make audit availability a condition of every business operation.

## Decision

- Every service records audit facts as `audit.recorded` events in its `event_outbox`, **in the same local transaction as the action**. If that insert fails, the action fails (fail closed locally).
- The `audit` service consumes `audit.recorded.*` (ADR-017), inserts into its inbox for deduplication, and appends to the **hash chain** in one transaction. A single consumer writes the chain, serialized by an advisory lock, so the chain has one order: the order of ingestion. Each entry also stores `occurred_at` (when it happened), `recorded_at`, `source_service` and `source_event_id`.
- The chain, canonical JSON, verification, anchors, insert-only permissions and admin viewer are unchanged from ADR-009 and F07. Only the `audit` service's application role can write the audit database; no business service has credentials for it.
- Admin actions on the audit data itself (`admin.view_audit`, `audit.verify`) are written directly by the `audit` service into the chain.
- **What is guaranteed:** no committed business action without a durable audit event; no event lost (at-least-once with deduplication); tamper evidence of everything that was ingested. **What is relaxed:** an entry may appear in the chain seconds after the action (audit lag, measured and alerted at 60 s), and ingestion order can differ from business order, which is why `occurred_at` is stored. If the `audit` service is down, business operations continue and events queue durably.
- Details are masked by the producer before they enter the outbox, and again by the audit service before hashing (defence in depth).

## Alternatives considered

- **Synchronous call to the audit service inside the transaction:** exact atomicity, but a remote call in a transaction and a hard availability dependency. Rejected.
- **Each service keeps its own chain:** simple, but verification and the admin view would span five chains and a compromised service could rewrite its own history. Rejected.
- **Change data capture from every service's database:** removes the producer code but needs Kafka Connect and couples the audit format to table layouts.
- **Per-source sequence numbers with gap detection:** would let the auditor notice a lost event; not in the MVP, listed as a hardening step.

## Consequences

- F07's atomicity criterion changes to "audit event and action commit or roll back together in the producer" plus an end-to-end completeness test across services (every action in the table appears exactly once in the chain after the system settles).
- A new alert: audit lag above 60 s, and DLQ depth above zero on the audit queue.
- The tamper-evident (not tamper-proof) limits stated in ADR-009 still apply.

## Revisit when

Regulatory needs demand synchronous, gap-free audit (add per-source sequences and gap detection, or an external append-only store).
