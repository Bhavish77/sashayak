# ADR-006: Idempotency design

Status: Proposed (2026-10-14).

## Context

Clients retry on timeouts, users double-click, mobile networks duplicate requests. A confirm must execute at most once and a retry must see the original result.

## Decision

- Confirm requires an `Idempotency-Key` header (8 to 64 characters from `[A-Za-z0-9_-]`). Typed confirmations derive the key from the message id.
- Keys are stored in Postgres with the user id, a hash of the canonical request (route, transfer id, snapshot hash) and the stored response once finished.
- Claim is an insert-on-conflict inside the business transaction. A concurrent duplicate waits on the row (up to 5 s) and returns the stored result with `Idempotent-Replay: true`. The same key with a different request hash returns `IDEMPOTENCY_KEY_REUSED`.
- Only successful results are stored. Failed attempts release the key so the client can correct the problem and retry.
- Keys expire after 24 hours.
- The rail call uses `client_reference` equal to the transfer id so that worker retries are idempotent on the partner side.
- The conversation endpoint has a separate `client_message_id` dedupe so a resent message never triggers a second LLM call.

## Alternatives considered

- Redis-only keys: faster, but a Redis loss would permit duplicates and the key could not share the business transaction.
- Natural idempotency by state only: still needed (status check), but does not return the original response body.

## Consequences

Correctness does not depend on Redis. Idempotency rows add a small write per confirm.

## Revisit when

Confirm volume makes the idempotency table a hot spot (partition by day).
