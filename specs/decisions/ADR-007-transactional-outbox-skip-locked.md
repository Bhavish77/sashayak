# ADR-007: Transactional outbox with SKIP LOCKED workers

Status: Proposed (2026-10-14). Extended 2026-10-15: in `transfers` the outbox becomes the durable saga command queue (`saga_commands`, ADR-016) and every producer also has an `event_outbox` relayed to RabbitMQ (ADR-017).

## Context

After a transfer is confirmed the system must call an external partner. Calling it inside the request risks both timeouts and the dual-write problem (database commit succeeds, call lost; or call succeeds, commit fails).

## Decision

The confirm transaction inserts a `saga_commands` row (`wallet.hold`) with the state change; later steps insert the next command in the same transaction as each status change (ADR-016). The same claim-and-lease pattern drives the event outbox relay (ADR-017). Workers claim rows with `FOR UPDATE SKIP LOCKED`, call the rail with the transfer id as the idempotency reference, and apply the outcome in a second transaction. Retries use `available_at` with exponential backoff and jitter (about 1 s, 4 s, 16 s). Ambiguous outcomes become PENDING_UNKNOWN and enqueue reconciliation jobs. Poison rows move to a failed state and raise a metric.

## Alternatives considered

- BullMQ/Redis queue: a second system with its own durability and the dual-write problem.
- Kafka or SQS: unnecessary operational weight.
- Calling the rail inline: user waits on a flaky dependency; a crash loses the call.

## Consequences

At-least-once delivery with exactly-once effect, because the rail is idempotent on the reference and the settle transaction is guarded by the transfer state. Several workers can run safely. Throughput is bounded by Postgres, which is fine for the target load and documented as an extraction point.

## Revisit when

Outbox throughput exceeds what one Postgres comfortably handles, or event consumers other than payouts appear.
