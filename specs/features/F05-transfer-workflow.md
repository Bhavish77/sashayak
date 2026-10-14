# F05: Secure transfer workflow

Covers: FR-XFER-1 to FR-XFER-12, FR-AUTH-5, FR-AUD-1, NFR-REL-1 to NFR-REL-3, NFR-SCAL-2, NFR-PERF-4.

## Problem and outcome

Money must move exactly once, only with the user's explicit approval, and the assistant must tell the truth about what happened even when a partner system is slow, flaky or silent. Outcome: prepare, confirm, execute, settle and reconcile as a state machine over Postgres, with a transactional outbox, idempotent partner calls, and templated messaging.

## Rules of the road

- The model can at most trigger **prepare**. Nothing the model outputs can confirm, cancel or execute.
- A transfer's snapshot is immutable once created; confirm must present its hash.
- Only successful confirms are stored as idempotent results; failed attempts release the key so the client can fix the problem and retry with the same key.
- Lock order is always: transfer row, then wallet row (prevents deadlocks).
- All state changes are one database transaction that also writes the `transfer_events` row, the ledger entry and the audit entry. The audit insert is the last statement.

## Behavior

**1. Prepare** (`prepare_transfer` tool or `POST /v1/transfers`). Preconditions: beneficiary belongs to the user; currency INR; amount between minimum (default 100 paise) and maximum (default 2,500,000 paise); total = amount + fee (fee is 0 in the MVP); available balance at least total; today's total of transfers in CONFIRMED, SUBMITTED, COMPLETED, PENDING_UNKNOWN and NEEDS_REVIEW (IST day) plus this total not above the daily limit (default 5,000,000 paise). Result: transfer PREPARED with snapshot `{ user_id, beneficiary { id, display_name, account_masked }, amount_minor, fee_minor, total_minor, currency, note, created_at }`, `snapshot_hash` = SHA-256 of the canonical JSON, `expires_at` = now plus 5 minutes (database clock), `requires_pin` when total is at or above the PIN threshold. No funds move. A user has at most one PREPARED transfer: preparing another cancels the older one with reason `superseded`.

**2. Summary.** The chat reply is a `transfer_confirmation` card plus a template sentence built from the snapshot: amount, recipient name and masked account, fee, total, and the expiry. No model text.

**3. Confirm.** Two channels, both ending in the same service:

- *Button/API*: `POST /v1/transfers/:id/confirm` with `Idempotency-Key`, `snapshot_hash`, and `pin` when required.
- *Typed*: allowed only when the user has exactly one non-expired PREPARED transfer, it does not require a PIN, and the entire normalized message (case-folded, punctuation and emoji removed, at most 4 tokens) equals a phrase in the confirm lexicon. The server derives the idempotency key from the message id. If a PIN is required, the assistant replies with a template telling the user to use the Confirm button. Any message that is not an exact lexicon match is handled as a new request and leaves the pending transfer alone until it expires or is superseded.

Lexicon (maintained in `shared`, tested as data). Confirm: `yes`, `yeah`, `yep`, `confirm`, `ok`, `okay`, `go ahead`, `proceed`, `do it`; `haan`, `han`, `ha`, `ji haan`, `theek hai`, `thik hai`, `kar do`, `bhej do`, `ok kar do`; `हाँ`, `हां`, `जी हाँ`, `ठीक है`, `कर दो`, `भेज दो`. Cancel: `no`, `nope`, `cancel`, `stop`, `dont`; `nahi`, `nahin`, `mat bhejo`, `ruko`; `नहीं`, `रुको`, `मत भेजो`, `रद्द`.

**4. Execute (inside confirm, one transaction).** Claim the idempotency key (replay, reject or wait up to 5 seconds as described in `API.md`); lock the transfer row and check owner, status PREPARED, not expired by database time, and hash match; verify the PIN when required (a wrong PIN returns an error without consuming the key and updates the PIN counter); lock the wallet row and re-check funds; move `total` from `available` to `held`; write ledger HOLD; set CONFIRMED and `confirmed_at`; write `transfer_events`, the outbox row (`transfer.submit`) and the audit entry; store the response. Return 202.

**5. Submit (worker).** Claim an outbox row using `FOR UPDATE SKIP LOCKED`; set SUBMITTED and increment attempts; call the rail `POST /payouts` with `client_reference` equal to the transfer id and a 5-second timeout.

| Rail outcome | Result |
|---|---|
| COMPLETED | One transaction: `held -= total`, ledger SETTLE, status COMPLETED, event, audit |
| REJECTED | One transaction: `held -= total`, `available += total`, ledger RELEASE, status FAILED with `failure_code` `RAIL_REJECTED`, event, audit |
| 4xx validation | Same as REJECTED with `RAIL_INVALID` |
| PENDING, 5xx, timeout, network error | Retry up to 3 attempts with exponential backoff (about 1 s, 4 s, 16 s) plus jitter by moving the outbox row's `available_at`; after the last attempt, or immediately for PENDING, status PENDING_UNKNOWN and enqueue `transfer.reconcile`. The hold stays. |

**6. Reconcile.** `GET /payouts/by-reference/:id` on a schedule (30 s, 1 min, 2 min, 5 min, then every 5 min). COMPLETED or REJECTED apply as above. PENDING reschedules. If the rail has no record (404), re-submit through the normal path (safe because the rail is idempotent on the client reference). After 24 hours unresolved, status NEEDS_REVIEW and the stuck-transfer alert fires. An admin can reconcile now or resolve NEEDS_REVIEW as COMPLETED or FAILED with a reason; both apply the matching ledger effect once and are audited.

**7. Cancel and expiry.** Cancel works for PREPARED only. An expiry job (every 30 s) sets EXPIRED when `expires_at` has passed; confirm checks the database clock itself, so a late job never allows a late confirm.

**8. Messaging.** After confirm the assistant says the transfer is being processed (never "sent"). Terminal wording appears only when the stored status is terminal. Status wording table is in F04.

## Acceptance criteria

- AC-F05-1: Prepare creates a PREPARED transfer with snapshot, hash, expiry 5 minutes ahead and the correct `requires_pin`; wallet balances and ledger are unchanged.
- AC-F05-2: Each of these is rejected with the documented error and creates nothing: amount zero, negative or fractional paise, below minimum, above maximum, currency other than INR, insufficient funds, daily limit exceeded, beneficiary of another user.
- AC-F05-3: Preparing a second transfer cancels the first with reason `superseded`; there is never more than one PREPARED per user.
- AC-F05-4: The confirmation text equals the golden template output for the snapshot in en, hi and hi-Latn and contains no model-generated text.
- AC-F05-5: A successful confirm yields exactly one HOLD entry, `available` down and `held` up by the total, status CONFIRMED, one outbox row, one event and one audit entry. A fault injected after the ledger insert rolls everything back.
- AC-F05-6: Repeating confirm with the same key and payload returns the same body with `Idempotent-Replay: true` and creates no second HOLD.
- AC-F05-7: The same key with a different transfer id or hash returns `IDEMPOTENCY_KEY_REUSED`.
- AC-F05-8: 100 parallel confirms with the same key produce exactly one HOLD and one outbox row, and every response is a success with an identical body.
- AC-F05-9: 20 parallel confirms with different keys on one transfer produce exactly one 202 and the rest `TRANSFER_NOT_CONFIRMABLE`.
- AC-F05-10: Two transfers confirmed concurrently that together exceed the balance: one succeeds, one returns `INSUFFICIENT_FUNDS`; `available` never goes negative.
- AC-F05-11: With a fake clock past expiry, confirm returns `TRANSFER_EXPIRED` even if the expiry job has not run; a cancelled transfer returns `TRANSFER_NOT_CONFIRMABLE`.
- AC-F05-12: A wrong `snapshot_hash` returns `TRANSFER_NOT_CONFIRMABLE`; if the balance dropped below the total, `INSUFFICIENT_FUNDS` is returned and no hold is written; a retry with the same key after the balance is restored succeeds.
- AC-F05-13: A transfer at or above the PIN threshold refuses typed confirmation with the button template and, via the API, requires a valid PIN (wrong PIN does not consume the key; see AC-F01-9).
- AC-F05-14: Every confirm and cancel lexicon phrase works in the right state with zero LLM calls; "haan lekin 800 bhejo" is not a confirmation and is processed as a new request; with no pending transfer a bare "haan" does nothing harmful and gets a clarifying template.
- AC-F05-15: A scripted model that returns a `CONFIRM` intent or calls `confirm_transfer` is rejected by the policy engine; no state changes and a `POLICY_DENIED` audit entry exists.
- AC-F05-16: Rail COMPLETED leads to SETTLE, `held` reduced, status COMPLETED, event and audit; ledger invariants hold.
- AC-F05-17: Rail REJECTED leads to RELEASE, `available` restored, status FAILED with a mapped reason message.
- AC-F05-18: Rail timeouts cause 3 retries with backoff (fake clock) and then PENDING_UNKNOWN with the hold intact; the assistant says the transfer is being verified.
- AC-F05-19: With rail mode `lost_response`, the payout executes at the rail, the response is dropped, reconciliation finds it by reference, and the transfer ends COMPLETED with exactly one payout at the rail.
- AC-F05-20: Killing the worker after the rail call and before the database update, then restarting it, ends COMPLETED with exactly one SETTLE entry and one payout at the rail.
- AC-F05-21: Two workers racing for the same outbox row result in one rail call.
- AC-F05-22: A transfer in PENDING_UNKNOWN for 24 hours (fake clock) becomes NEEDS_REVIEW and raises the stuck metric; admin resolve applies the ledger effect exactly once, requires a reason, is audited, and is refused for any other status.
- AC-F05-23: The daily limit uses IST day boundaries and the status set above, verified at 23:59:59 and 00:00:00 IST.
- AC-F05-24: A property test over random sequences of prepare, confirm, cancel, expire, rail outcomes and reconcile always preserves the ledger invariants.
- AC-F05-25: A state-machine test enumerates every status pair: only the transitions in ARCHITECTURE section 6 succeed; each writes an event and an audit entry; illegal ones raise and persist nothing.
- AC-F05-26: Stopping Redis during confirm does not affect correctness (idempotency, locks and state are in Postgres).
- AC-F05-27: Confirm API p95 is at most 300 ms at 50 concurrent users with the rail excluded (NFR-PERF-4).

## Errors and security

Error codes in `API.md`. The PIN is never logged or stored in the audit log. The rail adapter validates every response against a schema before acting. The transfer reference shown to users is random, not sequential. Logs and traces carry transfer ids and statuses only.

## Interfaces and dependencies

Tables `transfers`, `transfer_events`, `ledger_entries`, `wallets`, `beneficiaries`, `idempotency_keys`, `outbox`; ports `TransferRepo`, `WalletRepo`, `RailClient`, `IdempotencyStore`, `Clock`, `AuditSink`; mock-rail API in `API.md`; F01 (PIN), F06 (policy), F07 (audit).

## Tests required

Unit: state machine, snapshot hashing, limit calculation, lexicon matching, backoff schedule. Property: ledger invariants. Integration: every acceptance criterion against real Postgres, Redis and `mock-rail` with fault injection; concurrency tests use real commits. Reliability suite: AC-F05-8 to 10 and 18 to 22. E2E: happy path and double-click confirm.
