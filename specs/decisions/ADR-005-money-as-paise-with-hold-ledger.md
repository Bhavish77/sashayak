# ADR-005: Money as integer paise with a hold-based ledger in Postgres

Status: Proposed (2026-10-14).

## Context

Transfers are asynchronous and the partner can answer late, wrongly or not at all. The user's available balance must never allow overspending while a payout is in flight, and the history must be reconstructable.

## Decision

- All amounts are `BIGINT` paise (`*_minor`); currency fixed to INR by constraint. No floating point near money.
- Each wallet has `available_minor` and `held_minor`. Confirming a transfer moves the total from available to held (HOLD). Completion removes it from held (SETTLE). Failure moves it back to available (RELEASE). Credits add to available.
- `ledger_entries` is append-only with a kind, an amount and the resulting balances. Invariants (never negative, entries reconcile to balances, exactly one SETTLE or RELEASE per HOLD) are checked by property tests and a sweep after reliability tests.
- Wallet rows are locked with `SELECT ... FOR UPDATE` in a fixed order after the transfer row.

## Alternatives considered

- Single balance and "pending" flag: cannot distinguish money that is spendable from money in flight.
- Full double-entry accounting with accounts per party: more realistic for a real bank, more than the demo needs; the single-wallet design can be extended into it.
- Event sourcing the balance only: harder to query and to reason about in a demo.

## Consequences

Clear semantics for "processing" and "being verified" states, and a ledger that can be audited. Limits and daily totals are computed from transfers and ledger in SQL.

## Revisit when

Multiple currencies, fees with separate accounts, or interest are needed.
