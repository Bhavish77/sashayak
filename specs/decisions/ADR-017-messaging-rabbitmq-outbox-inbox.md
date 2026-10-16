# ADR-017: Messaging with RabbitMQ, transactional outbox and idempotent consumers

Status: Proposed (2026-10-15). Extends ADR-007.

## Context

Services must publish facts (audit entries, transfer status changes) without losing them when a crash, a broker restart or a network error happens between "the database committed" and "the message was sent" (the dual-write problem), and consumers must cope with duplicates.

## Decision

- **Broker: RabbitMQ 3.13** with the management plugin, one durable topic exchange `sahayak.events`, durable queues per consumer, persistent messages, publisher confirms, manual acknowledgements with a prefetch limit. The management UI lets a reviewer watch messages flow during the demo.
- **Transactional outbox in every producer.** The business transaction inserts rows into `event_outbox` (and, in `transfers`, `saga_commands` for commands). A relay in the service's worker claims unpublished rows with `FOR UPDATE SKIP LOCKED`, publishes them, waits for the broker's confirm, then marks them published. Rows are purged after 7 days. Delivery is **at-least-once**.
- **Inbox in every consumer.** A consumer first inserts the `event_id` into its `inbox` table in the same transaction as its effect; a duplicate hits the unique constraint and is acknowledged without effect. At-least-once delivery plus an idempotent consumer gives exactly-once effect.
- **Envelope** (all events): `event_id` (UUIDv7), `type`, `version`, `occurred_at`, `producer`, `request_id`, `traceparent`, `subject {type, id}`, `payload`. Routing key is the type plus a bounded qualifier (for example `transfer.status_changed.completed`). The catalog is `specs/EVENTS.md`; payload schemas are Zod in `packages/shared`.
- **Ordering.** There is no global or per-aggregate ordering guarantee. Consumers must be order-tolerant: `audit` records in arrival order and keeps `occurred_at`; the assistant notification consumer acts only on terminal states and is idempotent per transfer.
- **Failures.** A message that fails processing is retried with delay (a TTL retry queue, up to 5 attempts, tracked in a header), then dead-lettered to `<queue>.dlq`. Any message in a DLQ raises an alert. Poison messages never block the queue.
- **Schema evolution.** Within a version only additive, optional fields are allowed; a contract test compares schemas with committed snapshots and fails on a breaking change. A breaking change publishes a new `version` next to the old one until consumers move.
- **Commands are not events.** Saga commands to `wallet` travel over HTTP from the durable `saga_commands` queue (ADR-016), because the orchestrator needs an immediate, typed answer. Events announce facts that have already happened.
- **Trace context** is carried in the envelope and AMQP headers, so one trace spans an HTTP request, the outbox relay and the consumer.
- Redis stays disposable. It is not used as a message transport.

## Alternatives considered

- **Kafka or Redpanda:** the industry default for event streaming, but heavy for a laptop and more than this volume needs.
- **Redis Streams:** cheap, but durability depends on Redis persistence settings, and this project's rule is that Redis may be lost without losing facts.
- **NATS JetStream:** light and capable; a smaller ecosystem and tooling than RabbitMQ or Kafka for this project's purposes.
- **Postgres `LISTEN/NOTIFY` or polling between services:** couples services to each other's databases or loses messages.
- **Change data capture (Debezium) instead of an outbox poller:** removes the polling delay, adds Kafka Connect.
- **Calling the audit service synchronously:** puts a remote call inside the transaction, or loses events when it is down.

## Consequences

- Two new tables per producer and one per consumer, plus a relay loop; all in the `platform` kit, built once.
- Delivery delay of up to the relay polling interval (default 500 ms) plus consumer time. Measured and reported as audit lag and event lag.
- Operators must watch queue depth, DLQ depth and outbox lag (metrics and alerts in ARCHITECTURE section 11).

## Revisit when

Event volume or fan-out grows (move to Kafka or Redpanda), or the polling delay matters (use CDC).
