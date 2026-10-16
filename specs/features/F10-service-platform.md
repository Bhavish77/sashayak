# F10: Service platform (shared infrastructure kit and service contracts)

Covers: FR-SVC-1, FR-SVC-2, FR-SVC-3, FR-SVC-4, FR-SVC-5, NFR-ARCH-1, NFR-ARCH-2, NFR-ARCH-3, NFR-CONS-3, NFR-REL-8, NFR-OBS-3, NFR-MAINT-3, supports NFR-SCAL-1, NFR-MAINT-1.

## Problem and outcome

Five services need the same plumbing: configuration, logging, health, token verification, internal-route protection, database roles, retries, breakers, an outbox, an inbox, a broker client and trace propagation. Written five times it would drift and be tested five times; written once in a kit with no business logic it is tested once and reused. Outcome: `packages/shared` (contracts and pure utilities), `packages/platform` (infrastructure kit) and the system rules that make the five services behave as one product while staying independently deployable. Rationale: ADR-015, ADR-017, ADR-018.

The kit contains **no business rules**. Anything that mentions a wallet, transfer, conversation or audit entry belongs to a service.

## What the kit provides

| Capability | Behavior |
|---|---|
| Service skeleton | One function builds a Fastify app with request-id and `traceparent` handling, JSON logging, error mapping to `application/problem+json`, body and timeout limits, security headers, graceful shutdown (drain within 30 s) and two listeners: public (`PORT`) and internal (`INTERNAL_PORT`). `SERVICE_ROLES` selects `api`, `worker` or both. |
| Configuration | A Zod schema per service on top of a common base; startup exits non-zero naming the variable (never the value). Key material is validated by shape. |
| Route policies | Registering a route requires `{ roles, ownership }` (public) or an access-matrix entry (internal); startup fails otherwise. |
| Authentication | `TokenVerifier` (EdDSA, JWKS fetch with cache and pinning), `ServiceTokenSigner` and `ServiceTokenVerifier` (60 s, `aud`, unique `jti`), `AccessMatrix` loaded from `packages/shared/service-acl`, `StepUpVerifier`. |
| Database kit | Kysely over `pg`; pool settings; migration runner with the migrator role; transaction helper with the rule *no remote call inside a transaction* (a guard that fails tests if a service client is invoked while a transaction is open); test harness that creates a clean database per suite. |
| Redis kit | Prefixed client, rate limiter, dialog-style TTL store, breaker state store; a degraded mode that never throws into business code. |
| Resilience | `CircuitBreaker` (5 failures, 30 s open, half-open probe; state in Redis with a local fallback), `Bulkhead` (concurrency cap with bounded wait), `retry` with decreasing budgets and jitter (idempotent operations only), `callService` wrapper that combines timeout, one retry for reads, breaker and metrics. |
| Messaging | `OutboxWriter` (insert inside the caller's transaction), `OutboxRelay` (claim with `FOR UPDATE SKIP LOCKED`, publish with confirms, mark published), `Inbox` (insert `event_id` with the effect), RabbitMQ client with topology assertion, consumer runner (validate, deduplicate, retry queues, dead-letter after 5 attempts), purge jobs. |
| Observability | Logger with the redaction serializer, OpenTelemetry setup, metrics registry with bounded labels, `/healthz`, `/readyz` (dependency-aware), `/metrics` on the internal listener. |
| Contracts | In `packages/shared`: Zod schemas for every public route, internal route, event and error; helpers that generate OpenAPI and typed clients/fakes from them. |

## Rules that hold across services

1. **Database per service.** Each service has its own database, migrator role and app role; the app role can connect only to its own database. No cross-database query, view or foreign key. Ids from other services are opaque.
2. **No remote call inside a transaction.** A service commits, then calls; answers are applied in a new transaction (ADR-016).
3. **Public traffic only through `edge`; internal routes only on the internal listener** and only with a valid service token that the access matrix allows for that route.
4. **Every service verifies user tokens itself.**
5. **Events through the outbox only.** No handler publishes directly to the broker.
6. **Contracts are the source.** A route, internal route or event without a shared schema cannot be registered; a change to a schema that breaks a snapshot fails CI.
7. **Independence.** Each service starts and passes its tests alone, with collaborators replaced by fakes generated from the contracts.
8. **Time budgets decrease downstream:** `edge` to a service 10 s (streams excepted); `assistant` to `transfers` 5 s; calls to a service that makes no further calls (`wallet`) 3 s; rail 5 s and LLM 15 s from background or streaming paths. A caller's budget always exceeds the sum of the calls it makes while serving a request (the prepare-time lookups in `transfers` run in parallel).

## Health and readiness

| Endpoint | Meaning |
|---|---|
| `/healthz` | The process is up and its event loop responds. |
| `/readyz` | 200 only when the service's **own** database is reachable and migrations are current; Redis and RabbitMQ failures are reported as `degraded` in the body but do not fail readiness; other services being down never fails readiness. During shutdown it returns 503. |
| `/metrics` | Prometheus text format, internal listener only, label values bounded. |

## Acceptance criteria

- AC-F10-1 (isolation): For each of the five services, the application credentials are rejected when connecting to each of the other four databases, and the migrator credentials likewise; the app role of each service lacks DDL and, on append-only tables, UPDATE, DELETE and TRUNCATE. The `sahayak_sweep` role exists only in test and local configuration and no service's configuration accepts it.
- AC-F10-2 (architecture rules): `pnpm arch` fails on a fixture where one app imports another app, `domain` imports an adapter, `assistant-core` imports Fastify, SQL or an HTTP client, or a cycle exists; it passes on the repository.
- AC-F10-3 (no remote call in a transaction): A test calls a service client inside an open transaction and the guard throws; production code paths pass the same guard in the integration suites.
- AC-F10-4 (startup safety): A service refuses to start when a route lacks a policy or matrix entry, when a required variable or key is missing or malformed, or (in test and production) when a private signing key for another service is present.
- AC-F10-5 (internal protection): The tests of F01 AC-F01-16 pass for every service: `/internal/*` through the proxy and `edge` returns 404; missing, expired, wrongly signed or wrong-audience service tokens return 401 `SERVICE_TOKEN_INVALID`; a valid token for a route outside the caller's matrix row returns 403 `SERVICE_FORBIDDEN`; a reused `jti` within its lifetime on the same replica is rejected (best-effort replay protection).
- AC-F10-6 (contracts, provider side): For every public route, internal route and event, a provider test in the owning service validates real responses or published envelopes against the shared schema; OpenAPI generated for each service matches its registered routes (a drift test fails when a route is added without a schema).
- AC-F10-7 (contracts, consumer side): Each caller's tests run against a fake generated from the same schema, and a deliberately mutated schema fails both provider and consumer tests.
- AC-F10-8 (event schema snapshots): The event snapshot test fails when a required field is added, removed or retyped within a version, and passes for an added optional field.
- AC-F10-9 (outbox): A business change and its outbox row commit or roll back together (fault injected after the insert); with the broker down the change still commits; after the broker returns, every row is published exactly once as seen by a deduplicating consumer; two relays running together never publish a row concurrently without confirm bookkeeping (no row lost, duplicates tolerated).
- AC-F10-10 (inbox): Delivering one `event_id` many times, concurrently, produces one effect; the inbox row and the effect commit together; a consumer crash between effect and acknowledgement leads to a redelivery that produces no second effect.
- AC-F10-11 (retry and dead letter): A consumer that fails transiently succeeds after retries without losing the message; a message failing 5 times lands in `<queue>.dlq`, raises `dlq_messages` above 0, and the queue keeps flowing; a payload that fails schema validation goes directly to the DLQ with the validation error.
- AC-F10-12 (broker restart): Restarting RabbitMQ during a burst of 500 events loses none and duplicates only at-least-once duplicates that consumers absorb (NFR-CONS-3); topology is re-asserted on reconnect.
- AC-F10-13 (resilience primitives): Breaker, bulkhead, retry and `callService` pass their unit and property tests with fake clocks: opens after 5 consecutive failures, half-open probe after 30 s, closes on success, retries only idempotent calls, never exceeds the caller's budget, releases bulkhead slots on success, error and timeout, and keeps working (as closed) when Redis is unavailable (NFR-REL-8).
- AC-F10-14 (trace propagation): In an in-memory exporter test, one request through `edge`, `assistant`, `transfers` and `wallet`, the outbox relay and a consumer shares one trace id; `traceparent` is present in the envelope and the AMQP headers; each service's log lines carry the same request id (NFR-OBS-3).
- AC-F10-15 (health and readiness): For every service, `/readyz` is 200 with a callee stopped, 200 with `degraded` when only Redis or RabbitMQ is stopped, 503 when its own database is unreachable or migrations are pending, and 503 during shutdown; `/healthz` and `/metrics` answer on the internal listener and are not reachable on the public listener.
- AC-F10-16 (independence): The unit, integration and contract suites of each service run with only its own Postgres (plus Redis and RabbitMQ where it uses them) and contract fakes of its collaborators, in any order and in parallel with other services' suites.
- AC-F10-17 (configuration safety): Every service's configuration schema is documented in `.env.example`, a test checks that file lists every variable the schemas read, and no secret value appears in logs, errors or `/readyz` output.
- AC-F10-18 (replica safety): Two replicas of each service started against the same database and broker run the relay, the consumers and the scheduled jobs without duplicate effects (leases, `FOR UPDATE SKIP LOCKED`, advisory locks) and without sticky sessions.

## Errors and security

Kit errors map to the problem codes in `API.md` and `INTERNAL_API.md`. Nothing in the kit logs a request body, token, key or message payload; payloads are logged only as ids and sizes. The kit never opens a database connection other than to the service's own database.

## Interfaces and dependencies

`packages/shared` exports contracts, enums, the access matrix, canonical JSON, redaction, money and id utilities, locale catalogs. `packages/platform` imports `shared` only and exports the capabilities above as plain interfaces plus adapters (Fastify, `pg`, Redis, `amqplib`, OpenTelemetry). Used by every service (F01, F02, F05, F07, F09).

## Tests required

Unit and property tests for breaker, bulkhead, retry, rate limiter, canonical JSON and the guard against remote calls in transactions. Integration tests with real Postgres, Redis and RabbitMQ for the outbox, inbox, relay, consumer runner, health endpoints and database roles. Contract tests (provider and consumer). Security tests for internal protection and key separation. A small sample service inside the kit's test folder exercises the skeleton end to end so the kit is proven before any real service uses it.
