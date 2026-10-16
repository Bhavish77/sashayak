# ADR-011: Observability stack

Status: Proposed (2026-10-14). Amended 2026-10-15 for services: every service exposes metrics and traces, and trace context crosses HTTP and RabbitMQ hops.

## Context

An assistant that calls a model and moves money needs visibility into latency, failures, fallbacks and stuck transfers. The tools must be free and reproducible locally.

## Decision

- Logs: pino JSON with request id and trace id, redaction in the serializer; raw message text never logged.
- Metrics: Prometheus client; bounded label sets; names defined in `ARCHITECTURE.md` section 11.
- Traces: OpenTelemetry SDK with a redacting span processor; W3C `traceparent` propagated on every HTTP call and carried in event envelopes and AMQP headers, so one trace covers a chat turn from `edge` through `assistant`, `transfers` and `wallet`, and a transfer from confirm through the relay to the consumers; Jaeger in the `observability` compose profile.
- Each service has its own `/metrics` (internal listener); Prometheus scrapes all of them; RabbitMQ metrics (queue and DLQ depth) are scraped from its Prometheus plugin.
- Dashboards and alert rules stored as code and provisioned (Grafana, Prometheus rules).
- A test checks that every metric referenced in rules exists in the registry and that labels never come from user input.

## Alternatives considered

- Hosted APM (Datadog, New Relic): not free, not reproducible offline.
- Logs only: cannot show stuck-transfer or funnel trends.

## Consequences

Extra containers (about 2 GB RAM) kept behind a profile. Reviewers can see telemetry with one command.

## Revisit when

Deploying to a platform with its own observability; the OpenTelemetry exporters make the move small.
