# F07: Tamper-evident audit log

Covers: FR-AUD-1, FR-AUD-2, FR-AUD-3, supports FR-ADM-1, FR-ADM-2, NFR-SEC-1.

## Problem and outcome

When money or personal data is involved, "who did what, when, and was it allowed" must be answerable later, and nobody (including a compromised application) should be able to quietly rewrite the answer. Outcome: an insert-only table written in the same transaction as the action it records, hash-chained so edits and deletions are detectable, with a verification endpoint and an admin viewer.

This is tamper-evident, not tamper-proof: someone with owner-level database access can rebuild the chain. The mitigation is exporting the latest hash anchor outside the database (see Anchors). The documentation must say so plainly.

## What is recorded

| Action | When |
|---|---|
| `auth.login.success`, `auth.login.failure`, `auth.refresh`, `auth.refresh_reuse_detected`, `auth.logout`, `auth.pin.failure`, `auth.pin.locked` | Authentication events (F01) |
| `assistant.action` | An interpretation led to a tool call (records intent, tool, outcome; no raw user text) |
| `policy.denied` | The policy engine or the registry refused something, including unknown tools and model-proposed confirms |
| `output_guard.blocked` | A model reply was replaced (F06) |
| `transfer.prepared`, `transfer.confirmed`, `transfer.submitted`, `transfer.completed`, `transfer.failed`, `transfer.pending_unknown`, `transfer.needs_review`, `transfer.cancelled`, `transfer.expired`, `transfer.resolved` | Every transfer state change (F05) |
| `admin.view_conversation`, `admin.unmask`, `admin.view_audit`, `admin.reconcile`, `admin.resolve` | Staff access to other users' data and staff actions (F09) |
| `ticket.created` | Support tickets (F04) |
| `audit.verify` | A verification run, with its result |

Not recorded: raw message text, PINs, tokens, passwords, full account numbers, any value matching a redaction pattern.

## Entry shape and chaining

Columns are in `DATA_MODEL.md`. Rules:

- `details` is a small JSON object passed through the redaction serializer before hashing.
- Canonical JSON: keys sorted, no whitespace, timestamps as ISO-8601 UTC with milliseconds, numbers as integers where possible. One canonicalization function, used by writer and verifier, with test vectors committed to the repository.
- `hash = sha256(prev_hash || canonical_json(entry without hash and prev_hash))`; the first row's `prev_hash` is 64 zeros.
- Inserts take a transaction-level advisory lock so the chain has one order, then read the latest hash and insert. For state changes the audit insert is the last statement of the business transaction, so a rolled-back action leaves no entry and a committed action always has one.
- The lock is held briefly. Throughput target for the demo is at least 200 audit writes per second; if a profile shows contention, the documented scaling path is a per-day chain with a daily anchor row.

## Permissions

The application role has INSERT and SELECT on `audit_log`, no UPDATE, DELETE or TRUNCATE. Triggers also reject UPDATE and DELETE for any role except the owner during migrations (belt and braces). Customers have no route to it.

## Verification

`GET /v1/admin/audit/verify?from_id&to_id` walks the range in order, recomputes each hash from the stored fields and checks the `prev_hash` link. It reports `ok` with the number checked, or `first_bad_id` with a reason (`hash_mismatch`, `link_mismatch`, `gap`). A gap check uses ids, so a deleted row is detected as long as it is not at the very end; the anchor covers that case. A scheduled verification runs hourly in the worker, writes `audit.verify`, sets the metric `audit_verification_ok` (1 or 0) and raises the alert on 0.

## Anchors

The worker writes a line `{ id, hash, ts }` for the latest audit row to a separate append-only log file and to the structured log stream once per hour and at shutdown, and the verification command can take an expected anchor to compare. This does not make the system tamper-proof; it lets a reviewer compare the live chain against an externally kept value. Production-grade options (object store with retention, external timestamping) are documented as out of scope.

## Admin viewer

Filter by actor, action, resource, time; shows the chain status for the visible range; a "Verify range" button; export as CSV of the visible, masked fields.

## Acceptance criteria

- AC-F07-1: For each action in the table, performing it creates exactly one audit entry with the right actor, action, resource, result and request id.
- AC-F07-2: A transfer state change and its audit entry commit or roll back together (fault injected after the entry insert rolls both back; fault before leaves neither).
- AC-F07-3: Canonicalization matches the committed test vectors; the same entry always yields the same hash; key order and whitespace differences in input do not change it.
- AC-F07-4: Over 1,000 entries created by 20 parallel writers, the chain is linear (each `prev_hash` equals the previous row's hash in id order) and verification returns ok.
- AC-F07-5: Updating the `details` of any row using a privileged connection makes verification return `first_bad_id` equal to that row with `hash_mismatch`.
- AC-F07-6: Deleting a middle row is reported as a gap or link mismatch at the correct id; deleting the last row is detected when compared against the latest anchor.
- AC-F07-7: Using the application role, UPDATE, DELETE and TRUNCATE on `audit_log` fail with a permission error; the trigger blocks UPDATE and DELETE for a non-owner superuser-less role.
- AC-F07-8: No entry contains a PIN, token, password, raw message text or any substring matching a redaction pattern (checked with seeded sensitive inputs across the whole test run).
- AC-F07-9: Verification of 10,000 entries completes within 5 seconds on the reference machine; the endpoint streams or batches without loading everything in memory.
- AC-F07-10: The hourly verifier writes `audit.verify`, sets `audit_verification_ok`, and with a corrupted chain the alert condition is true.
- AC-F07-11: Customers receive `AUTH_FORBIDDEN` on every audit route; an admin viewing audit data produces an `admin.view_audit` entry.
- AC-F07-12: The anchor line is written hourly and at shutdown (fake clock), and the verify command with a wrong expected anchor fails.

## Errors and security

If the audit insert fails, the business transaction fails (fail closed). The audit service never logs sensitive values on its own errors. The repository documents the limits of tamper evidence in `ARCHITECTURE.md` and `ADR-009`.

## Interfaces and dependencies

Port `AuditSink` (interface in `core`, Postgres adapter in `apps/server`); `Clock`; redaction serializer (F06). Used by every feature.

## Tests required

Unit: canonicalization vectors, hash function, redaction of details. Integration: all acceptance criteria against real Postgres including privileged tamper tests, permission tests with the app role, and the parallel-writer test. Reliability: rollback coupling (AC-F07-2).
