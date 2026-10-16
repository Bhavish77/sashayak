# ADR-016: Orchestrated saga for transfers; events for side effects

Status: Proposed (2026-10-15).

## Context

Moving money now touches three parties that cannot share a transaction: the wallet database (hold, settle, release), the external payment rail, and the transfers database (workflow state). A distributed ACID transaction (two-phase commit) is not available across an external partner and is not worth it between our own services. The standard answer is a **saga**: a sequence of local transactions, each followed by the next step, with compensating actions when a later step fails. There are two styles: *choreography* (services react to each other's events) and *orchestration* (one coordinator tells each service what to do and records progress).

## Decision

**Orchestration, in `transfers`, for the money path.** The `transfers` row is the saga's state; a durable command queue (`saga_commands`) drives it. Each step is an idempotent command keyed by the transfer id:

| # | Step | Command | Success | Definite failure | Unknown outcome (timeout, 5xx, crash) |
|---|---|---|---|---|---|
| 1 | Place hold | `wallet` `POST /internal/v1/holds` | `HOLD_PLACED`, queue step 2 | `INSUFFICIENT_FUNDS`: `FAILED` (nothing to undo) | Resend the same command until a definite answer; after 30 minutes `NEEDS_REVIEW` |
| 2 | Pay out (**pivot**) | `mock-rail` `POST /payouts`, `client_reference` = transfer id | `SETTLING` | Rejected: `RELEASING` | At most 3 attempts, then `PENDING_UNKNOWN` and reconciliation; never release blindly; 24 hours then `NEEDS_REVIEW` |
| 3a | Settle hold | `wallet` `POST /internal/v1/holds/{id}/settle` | `COMPLETED` | A conflict (already released) is a defect: alert and `NEEDS_REVIEW` | Retry until it succeeds |
| 3b | Release hold (**compensation**) | `wallet` `POST /internal/v1/holds/{id}/release` | `FAILED` | n/a | Retry until it succeeds |

The payout is the **pivot transaction**: once the partner has paid, it cannot be undone. The saga is therefore ordered so that everything before the pivot is undoable (a hold can be released) and everything after it only retries forward (settle must eventually succeed). The hold is a **semantic lock**: it takes the money out of the spendable balance without pretending the payment is final.

How the saga stays correct:

- **Durable progress.** Every state change commits together with the next command (and an event outbox row) in one local transaction. A crashed or restarted worker simply claims the next command (`FOR UPDATE SKIP LOCKED`, lease with `locked_until`). A **saga watchdog** re-queues a command for any transfer stuck in an intermediate state with no pending command.
- **Idempotent participants.** `wallet` keeps a `holds` row per transfer id with a state (`HELD`, `SETTLED`, `RELEASED`, `REJECTED`, `VOIDED`). Repeating a command returns the current state; a conflicting command (settle after release) is refused with `409`. A release that arrives before any hold writes a `VOIDED` **tombstone**, so a delayed hold command from a retry can never place a hold after the saga has given up.
- **Accepting a confirm is local.** The confirm API only claims the idempotency key, moves `PREPARED` to `CONFIRMED`, and queues step 1, all in one transaction, and returns `202`. It does not wait for the wallet. Insufficient funds therefore appear as a `FAILED` transfer (reason `INSUFFICIENT_FUNDS`), not as a synchronous error. Prepare still pre-checks the balance, so this is rare.
- **No remote call in a transaction.** The worker calls the participant after the commit and records the answer in a new transaction.
- **Reconciliation, not guessing.** Ambiguous payouts are looked up at the rail by reference (existing design). Admin resolution becomes saga steps (`SETTLING` or `RELEASING`), so the ledger effect is still applied exactly once.

**Choreography for side effects.** Facts that nobody needs to coordinate are published as events (ADR-017) and consumed independently: `audit` ingests every audit event; `assistant` turns `transfer.status_changed` (completed, failed, needs review) into a templated message in the originating conversation. `transfers` does not know the assistant exists. Rule of thumb used here: if a step can undo or block money, it is orchestrated; if it merely reacts, it is an event.

## Alternatives considered

- **Pure choreography for the transfer.** Each service reacts to events (`transfer.confirmed` makes wallet hold, `wallet.hold_placed` makes transfers pay, and so on). Loosely coupled, but no single place knows where a transfer is; compensation order and timeouts are implicit; cycles are easy to create; and "where is my money?" means reading four services' logs. Rejected for money, kept for notifications and audit.
- **Two-phase commit / XA.** Needs every participant to support it; the rail does not; locks span services. Rejected.
- **Workflow engine (Temporal, Camunda, AWS Step Functions).** Excellent in practice and the right production answer; adds infrastructure, hides the mechanics this project sets out to demonstrate, and free tiers are limited. The hand-built saga is a few hundred lines and can be replaced by an engine later because steps are already idempotent commands.
- **Synchronous hold inside the confirm request.** Gives an immediate `INSUFFICIENT_FUNDS` error but ties confirm availability and latency to the wallet and needs a special path for timeouts. Rejected in favor of one uniform asynchronous path.
- **Event sourcing the transfer.** The `transfer_events` table already records the history; full event sourcing adds complexity without need.

## Consequences

- New statuses: `CONFIRMED` (approved, hold requested), `HOLD_PLACED`, `SETTLING`, `RELEASING`, besides the existing ones (see ARCHITECTURE section 6). User-facing wording stays simple (F04).
- Consistency is eventual: after confirm the balance changes within seconds, not within the request. The UI already shows "processing".
- Every step needs tests that kill the process or the participant at that step (system reliability suite, TESTING section 4).
- The saga is the central piece of the design and needs the most careful documentation: pivot, compensation, semantic lock, idempotent commands, tombstones, watchdog.

## Revisit when

Several different sagas appear (add a reusable engine or adopt Temporal), or step latency makes the asynchronous confirm a poor experience.
