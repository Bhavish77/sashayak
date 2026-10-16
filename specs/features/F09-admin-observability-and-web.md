# F09: Admin console, observability and web client

Covers: FR-ADM-1, FR-ADM-2, FR-OBS-1 to FR-OBS-3, FR-UI-1, FR-UI-2, FR-OPS-1 to FR-OPS-3, FR-OPS-5, FR-OPS-6, NFR-OBS-1, NFR-OBS-2, NFR-OBS-3, NFR-UX-1, NFR-UX-2, NFR-REL-4, NFR-OPS-1, NFR-CONS-2, FR-OPS-4 (Could).

## Problem and outcome

A system nobody can see into is a system nobody can trust. Operators need to inspect conversations, transfers, model calls and audit integrity; users need an accessible chat UI that still works when the model does not; the whole system of services must start with one command and be diagnosable across service boundaries. Outcome: a React web app with a customer chat and a role-gated admin area (talking only to `edge`), metrics, traces and logs wired end to end across all services, and a compose setup with an optional observability profile.

## Web client (`apps/web`, React + Vite + TanStack Query)

**Customer chat (FR-UI-1).** Login; conversation list and a single conversation view; streaming replies over SSE (fetch with a reader, since the bearer token goes in a header); card renderers for `transactions`, `balance`, `transfer_confirmation`, `transfer_status`, `navigation`, `menu`; quick-action chips (Check balance, Recent transactions, Send money, Support); a confirmation card with Confirm, Cancel and a PIN input when `requires_pin`, showing the countdown to expiry; a live transfer status card that polls while non-terminal; error states with the request id; language indicator that follows the reply locale. All text comes from message catalogs (en, hi, hi-Latn) and a locale switch. Untrusted strings (notes, names, replies) are rendered as text, never as HTML.

**Fallback mode (FR-UI-2).** When a turn returns a `menu` card the chips call the `wallet` and `transfers` APIs directly through `edge` (balance, transactions, prepare via a form with beneficiary picker and amount field) and render the same cards, so the product stays usable without the model **and without the `assistant` service**. Because confirm is asynchronous, the confirmation card shows CONFIRMED and then polls to the final status.

**Accessibility and performance (NFR-UX-1, NFR-UX-2).** Keyboard-only operation of chat, chips and confirmation; focus management after sending and when cards appear; `aria-live="polite"` region for assistant replies and status changes; visible focus; contrast meeting WCAG 2.1 AA; Devanagari and Latin rendering with a font stack that has both. Optimistic message echo and a "typing" state appear within 300 ms of sending.

**Admin area** (visible only for support and admin roles; every call is also enforced server-side): see below.

## Admin console (FR-ADM-1, FR-ADM-2)

| Page | Role | Content |
|---|---|---|
| Conversations | support, admin | Served by `assistant`. Search by user and time; transcript with the interpretation, tool calls and policy decisions per turn; masked by default |
| Transcript unmask | admin | A reason field is required; the view is audited as `admin.unmask`; a banner shows the unmasked state |
| Transfers | admin | Served by `transfers`. Filter by status and age; detail with events and saga commands; Reconcile now; Resolve (NEEDS_REVIEW only) with outcome and reason |
| Audit | admin | Served by `audit`. Filters (including producer), chain status, lag, Verify range, CSV export |
| LLM calls | admin | Served by `assistant`. Outcome, latency, tokens, provider, masked prompt and response |
| Evaluations | admin | Served by `assistant`. Runs, per-case results, side-by-side comparison |
| Tickets | support, admin | Served by `assistant`. List and status changes |

Customers get `AUTH_FORBIDDEN` from every admin route; the admin links are not rendered for them. Every admin view of another user's data produces an audit event in the serving service's outbox. There is no dead-letter or broker operations page: operators use the RabbitMQ management UI (compose, private network) and the platform dashboard.

## Observability (FR-OBS-1 to FR-OBS-3, NFR-OBS-1, NFR-OBS-2)

**Logs.** Every service writes pino JSON with `ts`, `level`, `service`, `msg`, `request_id`, `trace_id`, `user_id` (a hash, not the id, in logs), `route`, `status`, `duration_ms`. A serializer pipeline redacts known sensitive keys and patterns; raw message text is never logged. Test seam: logs captured in memory.

**Metrics.** Names and labels as in `ARCHITECTURE.md` section 11 (HTTP RED, `llm_request_duration_seconds`, `llm_tokens_total`, `interpreter_validation_failures_total`, `assistant_intent_total`, `assistant_fallback_total`, `tool_invocations_total`, `transfers_total{status}`, `transfer_stuck_count`, `idempotency_replays_total`, `rate_limited_total`, `rail_requests_total`, plus `audit_verification_ok`, `rail_breaker_state`, `llm_breaker_state` and `llm_inflight`, and the service-level metrics: `service_call_duration_seconds{callee}`, `service_breaker_state{callee}`, `saga_step_duration_seconds{step}`, `saga_command_lag_seconds`, `saga_watchdog_requeued_total`, `wallet_holds_total{state}`, `event_outbox_lag_seconds{service}`, `inbox_duplicates_total{consumer}`, `rabbitmq_queue_messages{queue}`, `dlq_messages{queue}`, `audit_lag_seconds`, `assistant_dependency_failure_total{callee}`). Each service exposes `/metrics` on its internal listener with a `service` label. Label values are bounded enums; no user ids or free text as labels.

**Traces.** OpenTelemetry spans for HTTP, pipeline stages, LLM calls, tool executions, service-to-service calls, saga steps, outbox publish and consume, Postgres queries and rail calls. The W3C `traceparent` is propagated on HTTP calls and stored in the outbox envelope and AMQP headers, so one trace covers a request across `edge`, `assistant`, `transfers` and `wallet`, and the event consumers continue it. The trace id is returned in error responses and appears in logs. Span attributes pass through the same redaction.

**Dashboards and alerts as code (`infra/`).** Grafana provisioning files for five dashboards: service health (RED per service, breaker states), assistant quality (intents, fallbacks, validation failures, LLM latency), transfer funnel and saga (statuses, stuck, replays, step durations, command lag, watchdog), messaging (outbox lag, queue depth, DLQ, inbox duplicates, audit lag), and platform (DB pools, Redis, RabbitMQ). Prometheus alert rules are exactly the list in `ARCHITECTURE.md` section 11 (the single authoritative list, including saga stuck, NEEDS_REVIEW, DLQ, lag, breaker and defect alerts). A test lints the rule files and checks every metric referenced exists in the code's metric registry.

## Runtime and operations (FR-OPS-1 to FR-OPS-6, NFR-REL-4, NFR-OPS-1)

- `docker compose up` starts `proxy` (which also serves the built `web` app), `edge`, `assistant`, `wallet`, `transfers`, `audit`, `mock-rail`, Postgres 16 (one container, five databases), Redis 7 and RabbitMQ 3 (management UI on the private network), runs each service's migrations, seeds data per service, and waits on health checks in dependency order. Each service image runs the `api` role, the `worker` role (outbox relay, consumers and scheduled jobs; for `transfers` also the saga, expiry, watchdog and reconciliation) or both, selected by `SERVICE_ROLES`, so the roles can be scaled separately. Base stack within 4 GB RAM.
- `docker compose --profile observability up` adds Prometheus, Grafana and Jaeger (extra 2 GB at most).
- `docker compose --scale` can run several replicas of `edge`, `assistant`, `wallet` and `transfers` behind the proxy (internal calls use the compose service names, resolved per call).
- Configuration is a Zod-validated environment schema per service; the process exits with a readable message on missing or invalid values (FR-OPS-5). `.env.example` documents every variable with safe defaults and no secrets.
- Migrations are versioned SQL files per service (`apps/<service>/migrations`) applied automatically in development and by an explicit `pnpm db:migrate` elsewhere (FR-OPS-6); each service's migrator role differs from its app role and can reach only its own database (DATA_MODEL).
- Every service serves `/healthz`, `/readyz` (own Postgres required; Redis and RabbitMQ reported as degraded; callee services not required, so one service's outage does not fail another's readiness) and `/metrics` on its internal listener.
- Graceful shutdown (every service): stop accepting, drain in-flight requests, the current saga command lease and outbox batch within 30 s, nack nothing silently, flush traces and logs.
- CI (FR-OPS-3): lint, type check, architecture check, unit, integration (Postgres, Redis and RabbitMQ service containers), contract (provider and consumer), security, reliability, system (compose stack: saga kill matrix, broker restart, consistency sweep), end-to-end (Playwright), build, `pnpm audit`, secret scan, eval gates.
- Public staging (FR-OPS-4, Could): try free-tier hosting for the services, Postgres, Redis and RabbitMQ (or a single-host compose deployment) and a static host for the web app; record in `docs/STAGING.md` what worked, what did not and the cost; never claim a URL that was not tested. If it cannot be done on free tiers the documented outcome is the failure and the local compose path remains the supported demo.

## Acceptance criteria

- AC-F09-1: Every admin route returns `AUTH_FORBIDDEN` for customers and 401 without a token, both through `edge` and directly at the owning service; support can reach conversations and tickets but not transfers, audit, LLM calls or evals.
- AC-F09-2: A support or admin viewing another user's conversation sees masked content and produces an `admin.view_conversation` audit entry (delivered through the outbox); unmasking without a reason is rejected; with a reason an admin sees unmasked content and an `admin.unmask` entry containing the reason; support cannot unmask.
- AC-F09-3: The transfer monitor lists NEEDS_REVIEW transfers; Reconcile now and Resolve call the API, update the status and ledger once, and show the audit entries (Playwright, admin role).
- AC-F09-4: The audit page shows chain status, current audit lag and a Verify range result; after a privileged tamper in the test `audit_db` it shows the failing id.
- AC-F09-5: Log capture from all services during a full e2e run shows `service` and request id on every line, trace id on request logs, the same request id across the services that handled one request, and no raw message text, phone, email, PIN or token.
- AC-F09-6: Scraping `/metrics` of every service after a scripted run shows each listed metric with non-empty, bounded labels in its owning service; a test fails if any label value derives from user input.
- AC-F09-7: The eval admin endpoints return runs, results and a comparison for two runs (AC-F08-8) and the Evaluations page renders them.
- AC-F09-8: A trace for one chat turn that prepares and confirms a transfer (Jaeger, or the in-memory exporters in tests) contains spans from `edge`, `assistant`, `transfers` and `wallet` for HTTP, pipeline, LLM, tool, service call, saga step, outbox publish, database and rail with a shared trace id, the audit consumer's span continues the same trace, and the error response carries the same trace id.
- AC-F09-9: Alert rule files pass `promtool check rules` (when available) or the repository's lint script; every metric in them exists in the registry.
- AC-F09-10: Provisioning files start Grafana with the five dashboards and a working Prometheus datasource (manual check recorded in the task report, not claimed by CI unless run).
- AC-F09-11: `docker compose up` on a clean machine reaches healthy status for all services in dependency order and the seeded demo user can log in and complete a transfer; the observability profile adds three services; the base stack stays within the 4 GB memory budget measured with `docker stats` (reported, not assumed).
- AC-F09-12: Starting any service with an invalid or missing required variable exits non-zero with a message naming the variable (no secret values printed).
- AC-F09-13: Sending SIGTERM to any service during a slow request lets it finish and exits within 30 s without losing a saga command or an outbox row; `/readyz` returns 503 during shutdown and when the service's own Postgres is down, reports Redis or RabbitMQ as degraded when only they are down, and stays 200 when a callee service is down.
- AC-F09-14: Two or three replicas of each of `edge`, `assistant`, `wallet` and `transfers` behind the compose proxy (and internal name resolution) serve a mixed workload that includes transfers, without sticky sessions and without errors, with no duplicate saga command execution (NFR-SCAL-1, NFR-SCAL-2).
- AC-F09-15: Playwright customer journeys pass: login, balance via chip and via typed Hinglish, transfer with confirm, transfer with PIN, cancel, expiry display, fallback mode with the LLM disabled, language switch, and an XSS payload in a note shown literally.
- AC-F09-16: Automated accessibility checks (axe) report no serious or critical violations on login, chat, confirmation card and admin pages; keyboard-only completion of a transfer is covered by a Playwright test.
- AC-F09-17: First visible feedback (optimistic message or typing indicator) appears within 300 ms of sending in the Playwright timing test with the scripted model.
- AC-F09-18: Each service's migrations apply from scratch to a clean database and are idempotent on rerun; each app role cannot alter tables, modify append-only tables, or connect to another service's database.
- AC-F09-19: CI definition contains every stage listed above, and running `pnpm verify` locally executes the same checks that CI runs.
- AC-F09-20: If public staging is attempted, `docs/STAGING.md` records the date, services used, outcome and limitations; if not attempted or failed, it says so.

## Errors and security

The web app stores the access token in memory and the refresh token in memory plus an in-memory fallback (no persistent storage of tokens in the MVP; page reload requires login, documented as a tradeoff, with the alternative of an HttpOnly cookie noted in ADR-010). CSP `default-src 'self'` with no inline scripts. Admin pages never render user-provided HTML. Metrics and trace endpoints are not publicly reachable in the compose setup.

## Interfaces and dependencies

Admin and ops routes in `API.md` (served by the owner service named there); SSE contract; message catalogs from `shared`; observability kit in `packages/platform` (F10); infra files under `infra/` (compose, proxy, RabbitMQ definitions, Prometheus, Grafana). Depends on F01 (roles), F02 (stream), F05 (transfers), F07 (audit), F08 (evals), F10 (platform).

## Tests required

Component tests for cards and catalogs; Playwright journeys for customer and admin; axe checks; integration tests for metrics, logs, traces, readiness and shutdown (per service); config tests; rule-file lint; compose smoke test and the system suite in CI where Docker is available.
