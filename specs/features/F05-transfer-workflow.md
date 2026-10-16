# F05: Secure transfer workflow (orchestrated saga)

Covers: FR-XFER-1 to FR-XFER-14, FR-AUTH-5, FR-AUD-1, NFR-REL-1 to NFR-REL-3, NFR-REL-6, NFR-REL-8, NFR-SCAL-2, NFR-PERF-4, NFR-PERF-5, NFR-CONS-1.

## Problem and outcome

Money must move exactly once, only with the user's explicit approval, and the assistant must tell the truth about what happened even when a partner system is slow, flaky or silent, and even when one of our own services is restarted in the middle. The transfer touches two services and an external partner that cannot share a transaction. Outcome: prepare, confirm, hold, pay out, settle and reconcile as an **orchestrated saga** owned by `transfers`, with a hold-based ledger in `wallet`, durable idempotent commands, compensation, and templated messaging. Rationale and alternatives: ADR-016.

## Rules of the road

- The model can at most trigger **prepare**. Nothing the model outputs can confirm, cancel or execute.
- A transfer's snapshot is immutable once created; confirm must present its hash.
- Only accepted confirms are stored as idempotent results; rejected attempts release the key so the client can fix the problem and retry with the same key.
- Every status change in `transfers` is **one local transaction** that also writes the `transfer_events` row, the next saga command (if any), the `transfer.status_changed` event row and the `audit.recorded` event row. If any insert fails the whole change fails.
- No transaction ever waits on another service: remote calls (wallet, rail) happen after a commit, from a worker, and their answers are applied in a new transaction.
- **State guard.** A worker applies a step's result only if the transfer is still in the status the step expects; otherwise it discards the result (and logs it). This makes late, duplicate and out-of-order answers harmless.
- Lock order inside a service: `transfers` locks the transfer row; `wallet` locks the wallet row. There is no cross-service lock.
- Every wallet command and the rail call are idempotent on the transfer id, so any step may run twice.

## Behavior

**1. Prepare** (`prepare_transfer` tool through the internal route, or `POST /v1/transfers`). Preconditions: beneficiary belongs to the user (looked up in `wallet` through the internal route); currency INR; amount between minimum (default 100 paise) and maximum (default 2,500,000 paise); total = amount + fee (fee is 0 in the MVP); available balance at least total (pre-check through the wallet's internal balance route; the authoritative check is the hold); today's total of transfers in CONFIRMED, HOLD_PLACED, SUBMITTED, SETTLING, COMPLETED, PENDING_UNKNOWN and NEEDS_REVIEW (IST day) plus this total not above the daily limit (default 5,000,000 paise). Result: transfer PREPARED with snapshot `{ user_id, beneficiary { id, display_name, account_masked }, amount_minor, fee_minor, total_minor, currency, note, created_at }` (the beneficiary name and masked account are copied from `wallet` at this moment), `snapshot_hash` = SHA-256 of the canonical JSON, `expires_at` = now plus 5 minutes (database clock), `requires_pin` when total is at or above the PIN threshold. The beneficiary's `rail_token` is stored on the transfer row and never returned. No funds move. A user has at most one PREPARED transfer: preparing another cancels the older one with reason `superseded`. The two wallet lookups (balance pre-check and beneficiary lookup) are issued in parallel **before** the local transaction opens; the transfer row is then created in one local transaction that first takes a per-user advisory lock for the limit checks. If the wallet cannot be reached, prepare returns `503 DEPENDENCY_UNAVAILABLE` and creates nothing.

**2. Summary.** The chat reply is a `transfer_confirmation` card plus a template sentence built from the snapshot: amount, recipient name and masked account, fee, total, and the expiry. No model text.

**3. Confirm.** Two channels, both ending in the same `transfers` use case:

- *Button/API*: `POST /v1/transfers/:id/confirm` with `Idempotency-Key`, `snapshot_hash`, and `pin` when required. `edge` verifies the PIN (wrong PIN: error from `edge`, key not consumed) and forwards a step-up assertion.
- *Typed*: allowed only when the user has exactly one non-expired PREPARED transfer, it does not require a PIN, and the entire normalized message (case-folded, punctuation and emoji removed, at most 4 tokens) equals a phrase in the confirm lexicon. `assistant` calls the internal route `confirm-typed`; the server derives the idempotency key from the message id; `transfers` refuses the call when the transfer requires a PIN. If a PIN is required, the assistant replies with a template telling the user to use the Confirm button. Any message that is not an exact lexicon match is handled as a new request and leaves the pending transfer alone until it expires or is superseded.

Lexicon (maintained in `shared`, tested as data). Confirm: `yes`, `yeah`, `yep`, `confirm`, `ok`, `okay`, `go ahead`, `proceed`, `do it`; `haan`, `han`, `ha`, `ji haan`, `theek hai`, `thik hai`, `kar do`, `bhej do`, `ok kar do`; `हाँ`, `हां`, `जी हाँ`, `ठीक है`, `कर दो`, `भेज दो`. Cancel: `no`, `nope`, `cancel`, `stop`, `dont`; `nahi`, `nahin`, `mat bhejo`, `ruko`; `नहीं`, `रुको`, `मत भेजो`, `रद्द`. Typed cancel uses the public cancel route as the user.

**4. Accept (inside confirm, one local transaction).** Claim the idempotency key (replay, reject or wait up to 5 seconds as described in `API.md`); take the per-user advisory lock and lock the transfer row; check owner, status PREPARED, not expired by database time, hash match, and the daily limit again (today's counted transfers plus this total, so a prepare and a confirm racing cannot exceed it); when `requires_pin`, verify the step-up assertion (signature by `edge`, audience `transfers`, subject equals the owner, `transfer_id` and `snapshot_hash` match, not expired) or reject the typed channel; set CONFIRMED and `confirmed_at`; insert the `wallet.hold` saga command, the `transfer_events` row, the status event and the audit event; store the response. Return 202 with status CONFIRMED. **The request does not call the wallet.**

**5. The saga (worker).** A worker claims a due command with `FOR UPDATE SKIP LOCKED` and a lease (`locked_until` = now plus 60 seconds), executes it outside any transaction, applies the answer in a new transaction (guarded by the expected status), and marks the command processed. A crashed worker's lease expires and another worker retries the command; because every step is idempotent, the retry is safe. A command is unique per transfer and type while unprocessed.

*Step 1, `wallet.hold`* (expects CONFIRMED; call `POST /internal/v1/holds`, 3 s timeout):

| Answer | Result |
|---|---|
| 201 or 200 with state HELD | One transaction: CONFIRMED to HOLD_PLACED, `hold_placed_at`, queue `rail.submit`, event, audit |
| 422 `INSUFFICIENT_FUNDS` (first answer or a repeat) | One transaction: CONFIRMED to FAILED with `failure_code` `INSUFFICIENT_FUNDS`; nothing to undo, and the wallet's `REJECTED` marker makes any late duplicate hold return the same 422 |
| 409 `HOLD_VOIDED` | The transfer was already moved on by an admin decision; the state guard discards the answer. If the transfer is somehow still CONFIRMED: NEEDS_REVIEW and `saga_defect_total{kind="hold_voided"}` |
| 200 with a state other than HELD (`SETTLED`, `RELEASED`) | Defect: NEEDS_REVIEW, alert, `saga_defect_total{kind="hold_unexpected_state"}` |
| Other 4xx (validation failure, unknown wallet) | Defect: CONFIRMED to RELEASING with `failure_code` `HOLD_REJECTED`, queue `wallet.release`. The release is idempotent and writes a tombstone when no hold exists, so a late duplicate hold is refused; then FAILED. `saga_defect_total{kind="hold_refused"}` |
| Timeout, 5xx, network error, wallet breaker open | Reschedule the same command by backoff (about 1 s, 4 s, 16 s, 1 min, then every 5 min); status unchanged. A transfer still CONFIRMED 30 minutes after `status_since` goes to NEEDS_REVIEW (pending commands cancelled) and an alert fires; the executor checks this when it reschedules and the watchdog checks it independently |

*Step 2, `rail.submit`* (expects HOLD_PLACED or SUBMITTED): set SUBMITTED, `submitted_at`, increment `rail_attempts`; call the rail `POST /payouts` with `client_reference` equal to the transfer id and a 5-second timeout.

| Rail outcome | Result |
|---|---|
| COMPLETED | One transaction: SUBMITTED to SETTLING, queue `wallet.settle`, event, audit |
| REJECTED | One transaction: SUBMITTED to RELEASING with `failure_code` `RAIL_REJECTED`, queue `wallet.release`, event, audit |
| 4xx validation | Same as REJECTED with `RAIL_INVALID` |
| PENDING, 5xx, timeout, network error | Retry up to 3 times after the first attempt (4 calls in all) with exponential backoff (about 1 s, 4 s, 16 s) plus jitter by moving the command's `available_at`; after the last retry, or immediately for PENDING, status PENDING_UNKNOWN and queue `rail.reconcile`. The hold stays |

*Step 3a, `wallet.settle`* (expects SETTLING; `POST /internal/v1/holds/:id/settle`): 200 SETTLED then SETTLING to COMPLETED with `completed_at`; 409 `HOLD_STATE_CONFLICT` then alert and NEEDS_REVIEW; transient failure then retry without limit (backoff capped at 5 minutes; the stuck alert fires after 15 minutes).

*Step 3b, `wallet.release`* (expects RELEASING; `POST /internal/v1/holds/:id/release`, the **compensation**): 200 (RELEASED, VOIDED or REJECTED) then RELEASING to FAILED; 409 then alert and NEEDS_REVIEW; transient failure then retry without limit.

**Rail circuit breaker.** The rail client is wrapped in the reusable circuit breaker (state in Redis). It opens after 5 consecutive failed calls (timeout, network error, 5xx) and stays open for 30 s; then one probe call is allowed (half-open): success closes it, failure re-opens it for another 30 s. While it is open the worker does not call the rail: it moves the command's `available_at` to the reopen time **without incrementing `attempts`**, so the transfer stays HOLD_PLACED or SUBMITTED with the hold intact and is not pushed towards PENDING_UNKNOWN by an outage it did not cause. A transfer that has waited 24 hours in HOLD_PLACED or SUBMITTED (measured from `hold_placed_at`) goes to NEEDS_REVIEW (see the watchdog), so an outage can never hide a transfer forever. Rejections (4xx and business rejections) do not count as failures. Reconciliation lookups use the same breaker. Users keep seeing 'processing' (F04 status table). The metric `rail_breaker_state` (0 closed, 1 half-open, 2 open) is exported and an alert fires if the breaker stays open for more than 5 minutes. The wallet client has its own breaker with the same thresholds; while it is open, wallet commands are rescheduled without consuming anything. If Redis is unavailable breakers behave as closed and the retry rules above apply unchanged.

**6. Reconcile.** `GET /payouts/by-reference/:id` on a schedule (30 s, 1 min, 2 min, 5 min, then every 5 min). COMPLETED goes to SETTLING and REJECTED to RELEASING as above. PENDING reschedules. If the rail has no record (404), the transfer moves PENDING_UNKNOWN to SUBMITTED and a `rail.submit` command is queued (safe because the rail is idempotent on the client reference). After 24 hours in PENDING_UNKNOWN (from `status_since`), status NEEDS_REVIEW and the alert fires. An admin can reconcile now (allowed in SUBMITTED, PENDING_UNKNOWN and NEEDS_REVIEW when a payout was attempted: it looks the payout up and applies a definitive answer through the normal transitions) or resolve NEEDS_REVIEW (below).

**7. Cancel and expiry.** Cancel works for PREPARED only. An expiry job (every 30 s) sets EXPIRED when `expires_at` has passed; confirm checks the database clock itself, so a late job never allows a late confirm. Cancel and confirm race on the same transfer row: exactly one wins.

**8. Manual resolution.** `POST /v1/admin/transfers/:id/resolve` applies only to NEEDS_REVIEW and requires a reason. Which outcome is allowed depends on where the transfer came from (`review_from_status`; the table is in ARCHITECTURE section 6.2): from `CONFIRMED` or `HOLD_PLACED` only `FAILED` (and for HOLD_PLACED only if no payout was ever attempted); from `SUBMITTED` or `PENDING_UNKNOWN` either, after the rail check; from `SETTLING` only `COMPLETED` (re-queues the settle) and from `RELEASING` only `FAILED` (re-queues the release), both meant for after an operator has repaired the cause of the refusal. **Rail check:** when `submitted_at` is set, resolve first looks the payout up at the rail: a definitive COMPLETED allows only `COMPLETED`; REJECTED or no record allows only `FAILED`; PENDING or an unreachable rail refuses both unless the request carries `force: true` and the reason, which is audited as forced. Resolve is refused with `409 TRANSFER_BUSY` while any command of the transfer holds an active lease. `COMPLETED` moves the transfer to SETTLING; `FAILED` moves it to RELEASING with `failure_code` `ADMIN_RESOLVED`. Both cancel the transfer's other unprocessed commands, queue the wallet command, and are audited; the wallet applies the ledger effect once (a release for a transfer with no hold writes a tombstone, so a delayed hold can never follow).

**9. Saga watchdog.** Every 60 seconds a job (a) finds transfers in CONFIRMED, HOLD_PLACED, SETTLING or RELEASING whose `status_since` is more than 30 seconds old, or in SUBMITTED or PENDING_UNKNOWN for more than 2 minutes, that have no unprocessed command, and queues the command that status expects (`wallet.hold`, `rail.submit`, `wallet.settle`, `wallet.release`, or `rail.reconcile`), incrementing `saga_watchdog_requeued_total` (in a healthy system the count stays at zero); and (b) applies the horizons: CONFIRMED for more than 30 minutes, HOLD_PLACED or SUBMITTED for more than 24 hours since `hold_placed_at`, and PENDING_UNKNOWN for more than 24 hours, go to NEEDS_REVIEW with an alert.

**10. Messaging.** After confirm the assistant says the transfer is being processed (never "sent"). Terminal wording appears only when the stored status is terminal. Status wording table is in F04. Every status change publishes `transfer.status_changed` (EVENTS.md); the assistant's notice (FR-XFER-14) is specified in F02.

## Failure matrix (what the system tests kill)

| Kill or fault point | Expected outcome |
|---|---|
| `transfers` worker stopped after accept, before the hold call | Another or restarted worker claims the command after its lease; hold placed once |
| `wallet` commits the hold, then the response is lost or the worker dies before HOLD_PLACED is recorded | The command is retried; the wallet returns the existing hold; one HOLD entry |
| Worker stopped between HOLD_PLACED and the payout | The `rail.submit` command is claimed after restart; one payout |
| Worker stopped after the rail answered, before recording | The command is retried; the rail returns the original outcome; one payout |
| Worker stopped in SETTLING or RELEASING, or the wallet commits settle or release but the answer is lost | The command is retried; the wallet returns the current state; one SETTLE or RELEASE |
| `wallet` stopped for minutes during any step | Commands back off and retry; no money moves; transfers continue when the wallet returns; beyond 30 minutes in CONFIRMED the transfer goes to NEEDS_REVIEW |
| `transfers` api or all workers stopped | Nothing moves; restart resumes; the watchdog repairs lost commands |
| RabbitMQ stopped | The saga is unaffected (commands are HTTP); events queue in the outbox and drain later |
| `audit` stopped | The saga is unaffected; audit events queue; the chain catches up |
| Redis stopped | Breakers act as closed; correctness unchanged |

## Acceptance criteria

**Prepare and accept (`transfers`)**

- AC-F05-1: Prepare creates a PREPARED transfer with snapshot, hash, expiry 5 minutes ahead and the correct `requires_pin`; no hold is requested and no ledger row is written.
- AC-F05-2: Each of these is rejected with the documented error and creates nothing: amount zero, negative or fractional paise, below minimum, above maximum, currency other than INR, insufficient funds (pre-check), daily limit exceeded, beneficiary of another user.
- AC-F05-3: Preparing a second transfer cancels the first with reason `superseded`; there is never more than one PREPARED per user, enforced by a partial unique index, including when two prepares race.
- AC-F05-4: The confirmation text equals the golden template output for the snapshot in en, hi and hi-Latn and contains no model-generated text.
- AC-F05-5: A successful confirm returns 202 CONFIRMED and yields exactly one `wallet.hold` command, one transfer event, one status event and one audit event row; the wallet is not called during the request (confirm still returns 202 with the wallet stopped); a fault injected after the command insert rolls everything back.
- AC-F05-6: Repeating confirm with the same key and payload returns the same body with `Idempotent-Replay: true` and queues no second command.
- AC-F05-7: The same key with a different transfer id or hash returns `IDEMPOTENCY_KEY_REUSED`.
- AC-F05-8: 100 parallel confirms with the same key produce exactly one command and one transition, and every response is a success with an identical body.
- AC-F05-9: 20 parallel confirms with different keys on one transfer produce exactly one 202 and the rest `TRANSFER_NOT_CONFIRMABLE`.
- AC-F05-10: Two transfers confirmed concurrently that together exceed the balance are both accepted (202); the saga ends one COMPLETED and one FAILED with `INSUFFICIENT_FUNDS`; the wallet holds exactly one amount; `available` never goes negative.
- AC-F05-11: With a fake clock past expiry, confirm returns `TRANSFER_EXPIRED` even if the expiry job has not run; a cancelled transfer returns `TRANSFER_NOT_CONFIRMABLE`.
- AC-F05-12: A wrong `snapshot_hash` returns `TRANSFER_NOT_CONFIRMABLE`. If the balance dropped below the total before the hold, the transfer ends FAILED with `INSUFFICIENT_FUNDS`, no HOLD entry exists, and the assistant states the reason (F04).
- AC-F05-13: A transfer at or above the PIN threshold refuses typed confirmation with the button template; the confirm route returns `PIN_REQUIRED` without a valid step-up assertion and refuses an assertion for another transfer, another snapshot hash, another user, an expired one, or one signed by a key other than `edge`'s (the PIN-lockout behavior itself is AC-F01-9).
- AC-F05-14: Every confirm and cancel lexicon phrase works in the right state with zero LLM calls; "haan lekin 800 bhejo" is not a confirmation and is processed as a new request; with no pending transfer a bare "haan" does nothing harmful and gets a clarifying template.
- AC-F05-15: A scripted model that returns a `CONFIRM` intent or calls `confirm_transfer` is rejected by the policy engine; no state changes and a `policy.denied` audit event exists.
- AC-F05-16: Prepare with the wallet unreachable returns `503 DEPENDENCY_UNAVAILABLE` and creates nothing; after 5 consecutive failures the wallet client's breaker opens and calls fail fast (NFR-REL-8).

**The saga (`transfers` worker with a fake wallet and the real mock rail; the system suite repeats them across real services)**

- AC-F05-17: Happy path: statuses occur in the order PREPARED, CONFIRMED, HOLD_PLACED, SUBMITTED, SETTLING, COMPLETED, each with an event and an audit event; the wallet's hold ends SETTLED; ledger invariants hold; the rail has exactly one payout for the transfer.
- AC-F05-18: Rail REJECTED leads to RELEASING, then FAILED; the hold ends RELEASED; `available` is restored; the failure reason is mapped to a message.
- AC-F05-19: Rail timeouts cause 3 retries with backoff (fake clock) and then PENDING_UNKNOWN with the hold intact; the assistant says the transfer is being verified.
- AC-F05-20: With rail mode `lost_response`, the payout executes at the rail, the response is dropped, reconciliation finds it by reference, and the transfer ends COMPLETED with exactly one payout at the rail.
- AC-F05-21: Killing the worker after the rail call and before recording, then restarting it, ends COMPLETED with exactly one SETTLE entry and one payout at the rail.
- AC-F05-22: Two workers racing for the same command result in one effect (one wallet hold, or one rail call, or one settle).
- AC-F05-23: A transfer in PENDING_UNKNOWN for 24 hours (fake clock) becomes NEEDS_REVIEW and raises the alert condition; admin resolve requires a reason, is audited, applies the ledger effect exactly once, is refused for any other status, and `COMPLETED` is refused when no payout was attempted.
- AC-F05-24: The daily limit uses IST day boundaries and the status set above, verified at 23:59:59 and 00:00:00 IST.
- AC-F05-25: A property test over random sequences of prepare, confirm, cancel, expire, wallet answers (ok, insufficient, timeout, duplicate, late), rail outcomes, reconcile and worker restarts, against fakes of the wallet and the rail, always preserves: at most one hold and at most one payout per transfer, the wallet ledger invariants, and that every transfer eventually reaches a terminal status or NEEDS_REVIEW once failures stop.
- AC-F05-26: A state-machine test enumerates every status pair: only the transitions in ARCHITECTURE section 6.2 succeed; each writes an event, a status event and an audit event; illegal ones raise and persist nothing.
- AC-F05-27: Stopping Redis during confirm and during the saga does not affect correctness (idempotency, leases and state are in Postgres).
- AC-F05-28: Confirm API p95 is at most 300 ms at 50 concurrent users with the wallet and rail excluded (NFR-PERF-4).
- AC-F05-29: With rail mode `error_5xx` or `timeout`, after 5 consecutive failures the breaker opens: further `rail.submit` commands cause no rail call, their `attempts` do not increase, the holds stay, and `rail_breaker_state` reports open. After 30 s (fake clock) one probe is sent; if it succeeds the breaker closes and the queue drains with every transfer completing exactly once (one payout each at the rail).
- AC-F05-30: A failed probe keeps the breaker open for another 30 s; with Redis stopped the breaker acts as closed and the normal retry and reconciliation rules still produce correct final states.
- AC-F05-31: With the wallet unreachable, confirm still returns 202; the `wallet.hold` command backs off and retries (fake clock) without changing status; when the wallet returns, the saga completes with exactly one hold. If the wallet stays unreachable for 30 minutes after confirm, the transfer becomes NEEDS_REVIEW with an alert; admin resolve `FAILED` ends in FAILED, and a late hold command at the wallet is refused (`HOLD_VOIDED`) and ignored by the state guard.
- AC-F05-32: When the wallet applies a hold but the response is lost, the retried command gets the existing hold back and exactly one HOLD entry exists.
- AC-F05-33: With a transfer's pending command deleted by a privileged connection (simulating a lost command), the watchdog re-queues it within 90 seconds (fake clock), the transfer completes, and `saga_watchdog_requeued_total` increments; with no lost commands the counter stays at zero over the whole suite.
- AC-F05-34: Every status change publishes exactly one `transfer.status_changed` event whose payload validates against the shared schema (contract test) and appears in the outbox in the same transaction as the change.

**The wallet side of the saga (`wallet`)**

- AC-F05-35: Each row of the hold, settle and release tables (ARCHITECTURE section 6.1, INTERNAL_API) has a test: results, ledger entries and balances are as stated, repeated commands change nothing, conflicting commands return `409`, a release before a hold writes a `VOIDED` tombstone and a later hold returns `HOLD_VOIDED`.
- AC-F05-36: 100 parallel identical hold commands produce exactly one HOLD entry; parallel holds for different transfers that together exceed the balance produce some `REJECTED` and the balance never goes negative.
- AC-F05-37: A property test over random command sequences (hold, settle, release, duplicates, out of order, different transfers) keeps the invariants in ARCHITECTURE section 6.1 and the hold state machine legal (1,000 sequences or more).
- AC-F05-38: A fault injected after the ledger insert inside a hold, settle or release rolls back the hold row, ledger entry, balances and outbox rows together.

**Additional saga rules**

- AC-F05-40: With the rail breaker held open (or the rail down) for 24 hours of fake time, a transfer in HOLD_PLACED or SUBMITTED goes to NEEDS_REVIEW with the alert condition, its hold stays, and an admin can resolve it according to the origin table; a transfer in CONFIRMED for 30 minutes goes to NEEDS_REVIEW even when the wallet breaker is open and no command is executing.
- AC-F05-41: When the wallet refuses a hold with a 4xx other than insufficient funds, the transfer goes CONFIRMED to RELEASING to FAILED with `HOLD_REJECTED`, the release writes a tombstone, a later duplicate hold command returns `HOLD_VOIDED` and changes nothing, `saga_defect_total{kind="hold_refused"}` increments, and the consistency sweep finds no HELD hold for the transfer. A repeated hold for an insufficient-funds hold returns the same 422 and still ends FAILED with `INSUFFICIENT_FUNDS`.
- AC-F05-42: Resolve behaves per the origin table in ARCHITECTURE section 6.2: each allowed and each refused combination of origin and outcome is tested; with the rail answering COMPLETED, `FAILED` is refused; with the rail answering REJECTED or 404, `COMPLETED` is refused; with PENDING or an unreachable rail both are refused unless `force` is sent with a reason (audited as forced); resolve is refused with `TRANSFER_BUSY` while a command holds an active lease; resolving `COMPLETED` from SETTLING re-queues the settle and, if the wallet still refuses, the transfer returns to NEEDS_REVIEW with the alert.

**System-level (all real services, compose stack)**

- AC-F05-39: For each row of the failure matrix, the fault is injected (container stopped, killed or paused) while transfers are in flight; after the system settles every transfer is COMPLETED or FAILED (or NEEDS_REVIEW only where the matrix says so) with exactly one hold and at most one payout, and the consistency sweep (ARCHITECTURE section 6.4) passes.

## Errors and security

Error codes in `API.md` and `INTERNAL_API.md`. The PIN is never logged or stored; `transfers` never sees it, only the step-up assertion. The rail adapter and the wallet client validate every response against a schema before acting. The transfer reference shown to users is random, not sequential. Logs and traces carry transfer ids and statuses only. The `rail_token` never leaves `transfers` and `wallet`.

## Interfaces and dependencies

`transfers`: tables `transfers`, `transfer_events`, `idempotency_keys`, `saga_commands`, `event_outbox`; ports `TransferRepo`, `SagaQueue`, `WalletClient`, `RailClient`, `IdempotencyStore`, `StepUpVerifier`, `EventOutbox`, `Clock`. `wallet`: tables `wallets`, `holds`, `ledger_entries`, `beneficiaries`, `event_outbox`; ports `LedgerRepo`, `HoldService`, `EventOutbox`. Mock-rail API in `API.md`; internal routes in `INTERNAL_API.md`; events in `EVENTS.md`; F01 (PIN and step-up), F06 (policy), F07 (audit), F10 (platform).

## Tests required

Unit: state machine, snapshot hashing, limit calculation, lexicon matching, backoff schedule, hold state machine. Property: wallet ledger and hold invariants (AC-F05-37), saga convergence (AC-F05-25). Integration (each service with real Postgres and Redis, the other service replaced by a contract fake, and the real `mock-rail` with fault injection): every acceptance criterion up to AC-F05-38; concurrency tests use real commits. System suite (full compose stack): AC-F05-39 and the end-to-end journeys. E2E: happy path and double-click confirm.
