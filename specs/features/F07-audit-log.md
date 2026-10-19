# F07: Tamper-evident audit log (audit service)

Covers: FR-AUD-1, FR-AUD-2, FR-AUD-3, FR-AUD-4, supports FR-ADM-1, FR-ADM-2, NFR-SEC-1, NFR-CONS-2, NFR-OBS-3.

## Problem and outcome

When money or personal data is involved, "who did what, when, and was it allowed" must be answerable later, and nobody (including a compromised application service) should be able to quietly rewrite the answer. Outcome: a dedicated `audit` service that ingests audit events from the other services, appends them to an insert-only, hash-chained table in its own database, and offers verification, anchors and an admin viewer. Producers record an event in the **same transaction** as the action it describes (through their outbox), so a committed action always results in exactly one audit entry eventually, and a rolled-back action leaves none. Rationale: ADR-019.

This is tamper-evident, not tamper-proof: someone with owner-level access to the audit database can rebuild the chain. The mitigation is exporting the latest hash anchor outside the database (see Anchors). Because audit is a separate service with its own database and credentials, a compromised wallet or transfers service has no write path to the chain except publishing more events. The documentation must say so plainly.

## What is recorded

Each row is published by the service that performed the action (column "Producer"). The event type is always `audit.recorded` (EVENTS.md); the action is in its payload.

| Action | When | Producer |
|---|---|---|
| `auth.login.success`, `auth.login.failure`, `auth.refresh`, `auth.refresh_reuse_detected`, `auth.logout`, `auth.pin.failure`, `auth.pin.locked`, `auth.pin.changed` | Authentication events (F01) | `edge` |
| `assistant.action` | An interpretation led to a tool call (records intent, tool, outcome; no raw user text) | `assistant` |
| `policy.denied` | The policy engine or the registry refused something, including unknown tools and model-proposed confirms (`assistant`); a role or ownership denial on a user action in any service (for example another customer's transfer id, or a customer calling an admin route) | any service that denies |
| `output_guard.blocked` | A model reply was replaced (F06) | `assistant` |
| `ticket.created` | Support tickets (F04) | `assistant` |
| `transfer.prepared`, `transfer.confirmed`, `transfer.hold_placed`, `transfer.submitted`, `transfer.settling`, `transfer.releasing`, `transfer.completed`, `transfer.failed`, `transfer.pending_unknown`, `transfer.needs_review`, `transfer.cancelled`, `transfer.expired`, `transfer.resolved` | Every transfer state change (F05) | `transfers` |
| `wallet.hold_placed`, `wallet.hold_rejected`, `wallet.hold_settled`, `wallet.hold_released`, `wallet.hold_voided` | Every ledger-affecting command (F05) | `wallet` |
| `beneficiary.created` | A beneficiary is added (F05) | `wallet` |
| `admin.view_conversation`, `admin.unmask`, `admin.view_llm_calls`, `admin.view_tickets` | Staff access to other users' conversations, to the model-call log, and to tickets (F09) | `assistant` |
| `admin.view_transfer`, `admin.reconcile`, `admin.resolve` | Staff reading a transfer that is not their own, and staff actions on transfers (F09); a forced resolve is marked in `details` | `transfers` |
| `admin.view_audit`, `audit.verify` | Staff reading the audit log; a verification run with its result | `audit` (written directly) |

Not recorded: raw message text, PINs, tokens, passwords, full account numbers, any value matching a redaction pattern.

## Ingestion (event consumer)

- Queue `audit.ingest`, bound to `audit.recorded.#`; consumer rules in EVENTS.md.
- For each message, one local transaction: take the single-writer advisory lock, insert `event_id` into `inbox` (a duplicate means acknowledge and stop), read the latest hash, append the row, update `prev_hash`/`hash`. No other service is called.
- The payload is validated against the shared schema; an invalid payload goes straight to the dead-letter queue and raises an alert (it is a defect in a producer, not a transient error).
- **Order.** The chain order is **ingestion order**, not `occurred_at` order, and `occurred_at` is stored and shown. A reviewer can sort by either. Order across services is not guaranteed and is not claimed.
- **Lag.** `audit_lag_seconds` = now minus `occurred_at` of the newest ingested event, exported as a gauge and as a histogram of per-event lag; an alert fires above 60 seconds for 2 minutes. A long lag means audit visibility is late, not that actions failed (the business is never blocked by audit availability; see Errors).

## Entry shape and chaining

Columns are in `DATA_MODEL.md` (database `audit_db`). Rules:

- `details` is a small JSON object passed through the redaction serializer **by the producer before it enters its outbox**, and again by `audit` on receipt (defence in depth).
- Canonical JSON: keys sorted, no whitespace, timestamps as ISO-8601 UTC with milliseconds, numbers as integers where possible. Timestamps are always strings of the form `YYYY-MM-DDTHH:mm:ss.sssZ` (UTC, exactly three fractional digits), and the shared timestamp schema rejects every other form, so the writer and the verifier can never hash two spellings of the same instant. `NaN` and `Infinity` are errors, not `null`. Every key, including one named `__proto__`, is data and is hashed. One canonicalization function in `packages/shared`, used by the writer and the verifier, with test vectors committed to the repository.
- `hash = sha256(prev_hash || canonical_json(entry without hash and prev_hash))`; the first row's `prev_hash` is 64 zeros. The entry includes `source_event_id`, `source_service`, `occurred_at` and `recorded_at` (the time of ingestion), so ordering metadata is part of the evidence. `recorded_at` is created by the writer in application code at millisecond precision (never the database default `now()`, which keeps microseconds), is hashed as the exact `YYYY-MM-DDTHH:mm:ss.sssZ` string and is stored from that same value, so the verifier recomputes the same hash from the row it reads back.
- The advisory lock gives the chain one order. Throughput target for the demo is at least 200 ingested events per second on the reference machine; if a profile shows contention, the documented scaling path is a per-day chain with a daily anchor row.

## Permissions

The `audit` application role has INSERT and SELECT on `audit_log` and `anchors`, and INSERT, SELECT and DELETE on `inbox` (the delete is only the 14-day purge), with no UPDATE, DELETE or TRUNCATE on `audit_log` or `anchors`. Triggers also reject UPDATE and DELETE for any role except the owner during migrations (belt and braces). Other services have **no database credentials for `audit_db`** (ADR-015 rule 2); their only path in is the broker, which accepts messages only from the producers' credentials. Customers have no route to audit data.

## Verification

`GET /v1/admin/audit/verify?from_id&to_id` (served by `audit` through `edge`) walks the range in order, recomputes each hash from the stored fields and checks the `prev_hash` link. It reports `ok` with the number checked, or `first_bad_id` with a reason (`hash_mismatch`, `link_mismatch`, `gap`). A gap check uses ids, so a deleted row is detected as long as it is not at the very end; the anchor covers that case. A scheduled verification runs hourly in the `audit` worker, writes `audit.verify`, sets the metric `audit_verification_ok` (1 or 0) and raises the alert on 0.

## Anchors

The `audit` worker writes a line `{ id, hash, ts }` for the latest audit row to the `anchors` table, to a separate append-only log file and to the structured log stream once per hour and at shutdown, and the verification command can take an expected anchor to compare. This does not make the system tamper-proof; it lets a reviewer compare the live chain against an externally kept value. Production-grade options (object store with retention, external timestamping) are documented as out of scope.

## Completeness across services

Because the chain is built from events, a missing entry can come from a lost event rather than a tampered row. Three mechanisms cover it: the outbox (an event is written with the business change and kept until the broker confirms it), the dead-letter alert (a rejected message is never silently dropped), and the **completeness check** run by `pnpm sweep:consistency`: for a time window it compares, per producer, the count of `event_outbox` rows of type `audit.recorded` with the count of audit entries from that producer and reports any difference once the lag has passed. The check runs in the system tests after every fault scenario.

## Admin viewer

Filter by actor, action, producer, resource, time; shows the chain status for the visible range; a "Verify range" button; export as CSV of the visible, masked fields. Reading audit data is itself audited (`admin.view_audit`).

## Acceptance criteria

- AC-F07-1: For each action in the table, performing it creates exactly one `audit.recorded` event in the producer's outbox, in the same transaction as the action, and exactly one audit entry once delivered, with the right actor, action, resource, result, producer and request id.
- AC-F07-2: In each producing service (`edge`, `assistant`, `wallet`, `transfers`), a business change and its audit event row commit or roll back together (a fault injected after the outbox insert rolls both back; a fault before leaves neither). With the broker and the `audit` service stopped, the business action still succeeds and the event is delivered after they return.
- AC-F07-3: Canonicalization matches the committed test vectors; the same entry always yields the same hash; key order and whitespace differences in input do not change it. An input with a `__proto__` key hashes differently from the same input without it; `NaN` and `Infinity` throw; a timestamp string without exactly three fractional digits, or with an offset instead of `Z`, is rejected by the shared timestamp schema.
- AC-F07-4: Over 1,000 events from 4 producers delivered in parallel, the chain is linear (each `prev_hash` equals the previous row's hash in id order) and verification returns ok.
- AC-F07-5: Updating the `details` of any row using a privileged connection makes verification return `first_bad_id` equal to that row with `hash_mismatch`.
- AC-F07-6: Deleting a middle row is reported as a gap or link mismatch at the correct id; deleting the last row is detected when compared against the latest anchor.
- AC-F07-7: Using the `audit` application role, UPDATE, DELETE and TRUNCATE on `audit_log` fail with a permission error; the trigger blocks UPDATE and DELETE for a non-owner role; the roles of the other four services cannot connect to `audit_db` at all.
- AC-F07-8: No entry contains a PIN, token, password, raw message text or any substring matching a redaction pattern (checked with seeded sensitive inputs across the whole test run, at the producer outbox and in the chain).
- AC-F07-9: Verification of 10,000 entries completes within 5 seconds on the reference machine; the endpoint streams or batches without loading everything in memory.
- AC-F07-10: The hourly verifier writes `audit.verify`, sets `audit_verification_ok`, and with a corrupted chain the alert condition is true.
- AC-F07-11: Customers receive `AUTH_FORBIDDEN` on every audit route; an admin viewing audit data produces an `admin.view_audit` entry written directly by `audit`.
- AC-F07-12: The anchor line is written hourly and at shutdown (fake clock), and the verify command with a wrong expected anchor fails.
- AC-F07-13: Delivering the same `event_id` ten times (including in parallel) yields one chain entry (inbox deduplication); a message with an invalid payload lands in the dead-letter queue without retries and raises the alert condition; the consumer keeps processing the messages behind it.
- AC-F07-14: With `audit` stopped for the duration of 50 business actions across the services and then restarted, all 50 entries appear, none is duplicated, and `audit_lag_seconds` returns below the alert threshold; the chain verifies.
- AC-F07-15: The completeness check reports zero difference after a normal run and after the fault scenarios of F05 AC-F05-39, and reports the missing producer and count when an outbox row of an `audit.recorded` event is removed by a privileged connection before delivery.
- AC-F07-16: `occurred_at` is preserved: for events delivered out of order, the stored `occurred_at` equals the producer's value, `recorded_at` reflects arrival, and the viewer can sort by either.
- AC-F07-17: After a round trip through Postgres, recomputing the hash from the stored columns equals the stored hash for every row; `recorded_at` comes from application code at millisecond precision, and a row inserted with a database-generated `recorded_at` is rejected by a test that would otherwise produce a false tamper alarm.

## Errors and security

**Fail closed at the producer, fail open at delivery.** If a producer cannot insert the audit event row into its outbox, the business transaction fails. If the broker or the `audit` service is down, business transactions still commit (the event waits in the outbox), and the lag alert tells operators that audit visibility is late. The `audit` service never logs sensitive values on its own errors. The repository documents the limits of tamper evidence in `ARCHITECTURE.md` and `ADR-009`, and the event-based design in `ADR-019`.

## Interfaces and dependencies

`audit`: ports `AuditRepo` (append, read range, verify), `InboxRepo`, `Clock`; canonicalization and redaction from `packages/shared`; messaging consumer from `packages/platform` (F10). Producers: port `AuditEvents` in each service writes the outbox row inside the caller's transaction. Used by every feature.

## Tests required

Unit: canonicalization vectors, hash function, redaction of details. Integration: all acceptance criteria against real Postgres and RabbitMQ including privileged tamper tests, permission tests with the `audit` role, the parallel-producer test and the duplicate/poison message tests. Reliability: rollback coupling in each producer (AC-F07-2), broker and `audit` restarts (AC-F07-14). System: completeness check after the F05 fault matrix (AC-F07-15).
