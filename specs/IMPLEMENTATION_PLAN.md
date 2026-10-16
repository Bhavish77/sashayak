# Implementation plan

Status: draft for approval, revised 2026-10-15 for the five-service architecture (ADR-015 to ADR-019). T01 was completed before this revision; every other box is unchecked on purpose. Nothing below has been built or run unless its Evidence line says so.

This plan turns the specs into 57 small tasks that Claude Code (or any developer) can execute in order. Each task is a vertical, verifiable increment: tests first, then the smallest implementation, then refactor. Read `CLAUDE.md` before starting. The order builds the **money path first** (platform kit, identity, audit, wallet, transfers and the saga, proven with failure injection on the full stack) and then the assistant, web, evaluation and operations around it.

## How to use this plan

1. Take the first unchecked task whose dependencies are checked.
2. Read the spec files named in its **Spec** line and the acceptance criteria it lists (`AC-Fxx-n` ids are in `specs/features/`).
3. **Red:** write the tests named under **Tests first** and run them; they must fail for the right reason. Record the failing output summary.
4. **Green:** implement the smallest change that passes. Do not edit a test to make it pass; if a test is wrong, say so in the report and get approval to change it.
5. **Refactor:** clean up with tests green. Run the task's **Verify** commands and `pnpm verify` when the task says so.
6. Produce the task report (format in `CLAUDE.md`), tick the box, fill **Evidence** with what was actually run and the result. If something could not be run (no Docker, no GPU, no key), write "not run" and why. Never write "passed" for a check that was not executed.
7. **Pause for review.** After each task, send the task report and wait for the owner's go-ahead before starting the next task. This applies after every task, not only at phase ends.
8. At each **Review point** (phase checkpoint) also give a short recap: a diagram of what exists, how a request flows through it, and the decisions taken. Wait for approval before starting the next phase.

## Global rules for every task

- Small commits, one task per commit (or a short series), message starts with the task id.
- No `any` without a comment explaining why; no `@ts-ignore`; no skipped or weakened tests.
- Money is integer paise everywhere. No floating point near money.
- New config goes into the owning service's config schema, `.env.example` and the README table in the same change.
- Anything that touches personal data goes through the redaction serializer.
- If the spec is ambiguous or wrong, stop and ask; if a decision is made, record it as an ADR or an amendment in the spec in the same change.
- A task that adds a route also adds it to the owning service's OpenAPI output, the shared contract (`packages/shared`), the role table and, for internal routes, the access matrix. A task that adds an event also adds its schema, a snapshot and the catalog entry in `EVENTS.md`.
- **Service rules** (ADR-015, F10): a service never imports another app and never connects to another service's database; no remote call inside a database transaction; every state change that must be announced writes its outbox row in the same transaction; a service's own suites use contract fakes of its collaborators, and the cross-service behavior is proved by the system suite.
- Scripts must be cross-platform (Node.js or pnpm scripts, never bash-only); the owner develops on Windows.
- Keep each task's change small and readable. If a task grows past what the owner can review comfortably, split it and say so; the task list may be refined (with the owner's approval) but requirement coverage must stay complete.
- Define domain terms in `docs/GLOSSARY.md` the first time they appear.

## Task map

| Phase | Tasks | Outcome |
|---|---|---|
| A. Foundation and platform kit | T01-T12 | Workspace for five services, contracts, redaction, config and logging, service skeleton, database kit, Redis and resilience primitives, messaging kit, service authentication, compose and CI |
| B. Identity (`edge`) | T13-T16 | Login, refresh, PIN and step-up, authorization test framework |
| C. Audit service | T17-T18 | Event ingestion into the hash chain, verification, anchors, admin API |
| D. Wallet service | T19-T22 | Ledger and hold domain, hold commands, reads and history, beneficiaries |
| E. Transfers and the saga | T23-T33 | Mock rail, state machine, idempotency, prepare, confirm, saga steps, reconciliation, watchdog, sweep, reliability suite |
| F. Gateway and system proof | T34-T36 | `edge` routing, full compose stack, kill-at-every-step system suite |
| G. Assistant | T37-T47 | Parsers, resolver, gateway, interpreter, policy, tools, FAQ, pipeline, streaming, transfer notices, injection tests |
| H. Web and admin | T48-T51 | Customer chat, transfer UX, admin API and UI |
| I. Evaluation | T52-T54 | Dataset, NLU evaluator, workflow evaluator and gates |
| J. Operations and ship | T55-T57 | Telemetry across services, load and security suites, documentation, staging attempt |

Review points (phase checkpoints) after T12, T18, T22, T36, T47, T51, T54 and T57. In addition, the implementer pauses for review after **every** task (see step 7 above).

---

## Phase A: Foundation and platform kit

### T01. Monorepo scaffold and quality gates
- [x] Done
- **Depends on:** none
- **Covers:** NFR-MAINT-1, NFR-MAINT-2 (config only), NFR-SEC-4 (lockfile)
- **Spec:** ARCHITECTURE sections 4 and 14; TESTING sections 1, 7, 8
- **Tests first:** a smoke test per package that imports its entry point; a dependency-cruiser fixture that deliberately violates a rule (for example `core` importing `apps/server`) and must fail the `arch` script; a lint test file with a known violation excluded from the main run to prove the rules are active.
- **Build:** first, an environment check (Node 22, pnpm, Git, Docker Desktop, available RAM; report what is missing and ask before installing). Then `docs/GLOSSARY.md` as an empty template. Then repository hygiene so that two Windows machines (the owner's laptop and desktop PC, sharing code through GitHub) behave the same: pin Node and pnpm versions (`engines`, `packageManager`, `.nvmrc`), a `.gitattributes` that forces LF line endings, a `.gitignore` covering `node_modules`, build output and every `.env` file, a committed `pnpm-lock.yaml`, and `.env.example` as the only committed environment file. Local-only files (`CLAUDE.local.md` and the `.private/` folder) are listed in `.gitignore`; if a `.gitignore` already exists in the folder, extend it rather than replacing it. Then a pnpm workspace with `apps/server`, `apps/mock-rail`, `apps/web`, `packages/shared`, `core`, `llm`, `evals`; TypeScript strict base config; ESLint and Prettier; Vitest with coverage thresholds configured per module (90% branch on money, idempotency, policy, ledger and audit paths, enforced once those modules exist); dependency-cruiser rules from ARCHITECTURE section 4 (including no cycles); root scripts named exactly as in TESTING section 8, each exiting non-zero when its suite is empty-but-required later (placeholders allowed only for suites not yet built, listed in the report).
- **Done when:** `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm arch`, `pnpm test:unit` run and pass; the deliberate boundary violation fails `arch` as expected.
- **Verify:** the commands above.
- **Evidence:** All five ran and passed on 2026-10-14 (Node 22.13.0, pnpm 10.17.1, Windows 11): `pnpm install --frozen-lockfile` (up to date, no warnings); `pnpm lint` (ESLint 0 problems, Prettier clean); `pnpm typecheck` (7 packages, all done); `pnpm arch` (15 modules, 14 deps, 0 violations); `pnpm test:unit` (9/9 tests, including the arch- and lint-violation fixture proofs). `docker compose config` and `docker compose up` not run — Docker daemon not started this session (no compose file exists yet; that is T06). 14 of the 28 root scripts are placeholders (test:int, test:contract, test:reliability, test:security, test:e2e, eval:nlu, eval:workflow, eval:check, eval:compare, spec:check, db:migrate, db:seed, infra:test:up, loadtest, build) that exit 1 with the task that will build them; `pnpm verify` therefore currently fails at `spec:check`, as intended.

- **Note (2026-10-15):** T01 was built before the decision to split the system into five services (ADR-015). Its workspace (`apps/server`, `packages/core`) is reshaped by T02; nothing else in T01 changes.

### T02. Reshape the workspace for five services
- [x] Done
- **Depends on:** T01
- **Covers:** NFR-MAINT-1, NFR-ARCH-1 (architecture rules), FR-SVC-1 (layout)
- **Spec:** ARCHITECTURE sections 3 and 4; ADR-015; F10 AC-F10-2; TESTING section 8
- **Tests first:** dependency-cruiser fixtures that must fail `pnpm arch`: one app importing another app; an app's `domain` importing an `adapters` module; `assistant-core` importing Fastify, `pg`, Redis or an HTTP client; `shared` importing another package; a cycle; each fixture is excluded from the normal run and executed by a test that expects the failure (AC-F10-2). A smoke test per workspace that imports its entry point. A script test that every root command in TESTING section 8 exists, including the new ones (`test:system`, `keys:generate`, `seed:check`, `sweep:consistency`, `stack:reset`).
- **Build:** rename `packages/core` to `packages/assistant-core`; add `packages/platform`; replace `apps/server` with `apps/edge`, `apps/assistant`, `apps/wallet`, `apps/transfers` and `apps/audit`, each with `src/{domain,app,adapters,main}`, `migrations/` and `seed/` folders and an entry point that only prints its service name for now; keep `apps/mock-rail`, `apps/web`, `packages/shared`, `packages/llm`, `packages/evals`. Update workspace names, TypeScript references, ESLint and Vitest configuration and the dependency-cruiser rules to the rules in ARCHITECTURE section 4. Update the placeholder root scripts to the list in TESTING section 8, each pointing at the task that will build it.
- **Done when:** `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm arch` and `pnpm test:unit` pass; every deliberate violation fails `arch`; no file refers to `apps/server` or `packages/core`.
- **Verify:** the commands above.
- **Evidence:** All five ran and passed on 2026-10-16 (Node 22.13.0, pnpm 10.17.1, Windows 11): `pnpm install --frozen-lockfile` (13 workspace projects, up to date); `pnpm lint` (ESLint 0 problems, Prettier clean); `pnpm typecheck` (12/12 packages "Done"); `pnpm arch` (26 modules, 29 deps, 0 violations on the real repo); `pnpm test:unit` (15 files, 19/19 tests). The five deliberate fixtures under `tools/fixtures/arch-violations/` each fail with the expected rule name (`wallet-never-imports-another-app`, `assistant-domain-imports-shared-only`, `assistant-core-no-infra-dependencies`, `shared-imports-nothing-internal`, `no-circular`), verified both by direct `depcruise` runs and by the permanent Vitest regression tests. `grep` for `apps/server`, `packages/core` and `@sahayak/core`/`@sahayak/server` across the repo (excluding `specs/`) and in `pnpm-lock.yaml` returns nothing. Not run: anything needing Docker/Postgres/Redis/RabbitMQ (unchanged from T01; still not required by this task).

### T03. Shared domain contracts
- [x] Done
- **Depends on:** T02
- **Covers:** FR-NLU-2, FR-NLU-4 (schema), NFR-MAINT-3 (base)
- **Spec:** API conventions and error table; F03 interpretation schema; DATA_MODEL conventions; ARCHITECTURE section 6.2 (statuses)
- **Tests first:** Zod schema tests for the interpretation schema (valid, missing fields, extra fields rejected, unknown intent rejected, amount bounds); money helper tests (parse, format with Indian grouping, add and subtract, no float, overflow guard); status enum equals the twelve transfer statuses and five hold states in ARCHITECTURE; error-code table test (every public and internal code has status, title and a message key); message-catalog completeness skeleton (every key has en, hi, hi-Latn).
- **Build:** in `packages/shared`: branded id types, money type and formatter, enums (intents, transfer statuses, hold states, failure codes, roles, locales, screens), error-code table (public codes from `API.md` and internal codes from `INTERNAL_API.md`), problem+json schema, pagination schemas, card and message schemas, interpretation schema, confirm and cancel lexicon data, a `Clock` port with a fake clock (ARCHITECTURE section 4 puts it in `shared` so that `assistant-core` can use it), message catalogs (initially the keys needed so far).
- **Done when:** tests above pass; package exports are the only way other packages see these types.
- **Verify:** `pnpm --filter @sahayak/shared test:unit`, `pnpm typecheck`, `pnpm arch`.
- **Evidence:** All three ran and passed on 2026-10-16: `pnpm --filter @sahayak/shared test:unit` (12 files, 115/115 tests — added a `test:unit` script to every workspace package, scoped via a CLI filter against the one root Vitest config, so this exact command works); `pnpm typecheck` (12/12 packages "Done"); `pnpm arch` (48 modules, 75 deps, 0 violations). Full-repo `pnpm test:unit` also run: 26 files, 133/133 tests. `pnpm lint` also run and clean. Card `data` payloads (balance/navigation/etc.) are intentionally left as `z.unknown()` for now — see Deviations in the task report.

### T04. Service contracts, events and canonical JSON
- [ ] Done
- **Depends on:** T03
- **Covers:** FR-SVC-4, NFR-ARCH-2 (schemas and fakes), NFR-ARCH-3 (access matrix data), NFR-MAINT-3 (base)
- **Spec:** API; INTERNAL_API; EVENTS; F10 (contracts); F07 (canonicalization); ADR-017, ADR-018
- **Tests first:** event envelope and the two catalog payloads (`audit.recorded` v1, `transfer.status_changed` v1) validate good samples and reject bad ones; snapshot test for event schemas that fails on a required field added, removed or retyped and passes for an added optional field (AC-F10-8); the access-matrix data lists exactly the internal routes in `INTERNAL_API.md` and every row has callers (a test compares it with the shared internal route registry); canonical JSON test vectors committed as fixtures (key order, whitespace, timestamp format, integers; AC-F07-3); a generated contract fake for one internal route answers according to its schema and a deliberately mutated schema makes both a provider-style and a consumer-style test fail (AC-F10-7).
- **Build:** in `packages/shared`: a route registry that holds method, path, roles or caller list, request and response schemas for public routes (initially the auth, wallet, transfers routes in `API.md`) and internal routes (`INTERNAL_API.md`); event envelope and payload schemas with committed snapshots under `events/__snapshots__`; `service-acl` access matrix as data; canonical JSON function with vectors; helpers that generate a typed client and an in-memory fake from a registered route.
- **Done when:** the tests pass; adding a route to the registry without schemas fails typecheck.
- **Verify:** `pnpm --filter @sahayak/shared test:unit`, `pnpm test:contract` (shared part).
- **Evidence:**

### T05. Redaction and masking library
- [ ] Done
- **Depends on:** T03
- **Covers:** FR-SEC-3, NFR-PRIV-1
- **Spec:** F06 (personal-data redaction)
- **Tests first:** positive and negative table tests per pattern (phone, email, bank account, card with Luhn, PAN-like, Aadhaar-like, IFSC-like, UPI-like); amounts never redacted (`₹2,000`, `2000`, `Rs 500` survive); property test that masked output contains none of the sensitive substrings generated; account display mask `XXXX1234`; fuzz test that redaction never throws and is idempotent.
- **Build:** `packages/shared/redaction` with `redactText`, `maskAccount`, `redactObject` (deep, key-aware), and serializers for pino and OpenTelemetry attributes.
- **Done when:** AC-F06-5 passes; module has at least 90% branch coverage.
- **Verify:** `pnpm test:unit`, coverage report.
- **Evidence:**

### T06. Configuration, logging and request context
- [ ] Done
- **Depends on:** T02, T03, T05
- **Covers:** FR-OPS-5, FR-OBS-3, FR-SEC-6, NFR-SEC-5
- **Spec:** F06 (limits and hardening), F09 (logs, runtime), F10 (configuration); ARCHITECTURE section 9
- **Tests first:** config tests (missing required var names the variable and exits non-zero without printing secret values, malformed key material rejected, defaults applied, numeric parsing, a common base schema extended by a service schema); `.env.example` checked against every schema by a test (AC-F10-17); logger test with an in-memory sink (fields `service`, `request_id`, `trace_id` present, request id propagated through async context, sensitive keys redacted, no raw secrets).
- **Build:** in `packages/platform`: Zod environment loader with a base schema, pino logger with redaction hooks and async-local request context, the system-clock adapter for the `Clock` port in `shared`, `.env.example` skeleton.
- **Done when:** AC-F06-11 (config part) and AC-F09-12 (kit part) pass.
- **Verify:** `pnpm test:unit`, a manual run of a sample entry with a missing variable (record output).
- **Evidence:**

### T07. Service skeleton
- [ ] Done
- **Depends on:** T04, T05, T06
- **Covers:** FR-SEC-5 (headers, CORS, body limit), NFR-SEC-3, NFR-OBS-1, NFR-REL-4, NFR-MAINT-3, FR-SVC-5 (health, readiness, metrics)
- **Spec:** F10 (service skeleton, health and readiness); API conventions; ARCHITECTURE sections 9 and 10; F06 limits
- **Tests first:** integration tests with `app.inject` against a sample service built from the skeleton: every error is problem+json with request id; unknown route is 404 problem body; body over 16 KB is 413; security headers present on the public listener; CORS grants only allowlisted origins and the internal listener sends no CORS headers; `/healthz`, `/readyz` and `/metrics` are served on the internal listener only; `/readyz` follows the dependency probes (own database required, Redis and broker degraded, callees ignored, 503 during shutdown; AC-F10-15 with fake probes); graceful shutdown test with a slow route and a fake in-progress job (AC-F09-13, kit part); an unexpected exception returns `INTERNAL` without stack, SQL or path (AC-F06-12); startup fails when a route lacks a policy or matrix entry (AC-F10-4, part); OpenAPI generated from the route registry matches the registered routes (drift test).
- **Build:** in `packages/platform`: Fastify app factory with Zod type provider, two listeners (`PORT`, `INTERNAL_PORT`), `SERVICE_ROLES` handling (`api`, `worker`), error handler mapping domain errors to the table, request id and `traceparent` plumbing, route registration helper requiring `{ roles, ownership }`, readiness probe interface, graceful shutdown coordinator, `/metrics` registry stub with bounded-label helper.
- **Done when:** AC-F06-10, AC-F06-12, AC-F09-13 (kit part) and AC-F10-15 (with fakes) pass.
- **Verify:** `pnpm test:int`, `pnpm test:contract`.
- **Evidence:**

### T08. Database kit, per-service databases and roles
- [ ] Done
- **Depends on:** T06
- **Covers:** FR-OPS-6, FR-SVC-1, NFR-ARCH-1 (credentials), NFR-REL-5
- **Spec:** DATA_MODEL (roles, conventions, indexes); F10 rules 1 and 2; ADR-015
- **Tests first:** integration tests against real Postgres: `infra/db/init` creates `edge_db`, `wallet_db`, `transfers_db`, `assistant_db` and `audit_db` with migrator, app and readonly roles per database; each app role is rejected when connecting to each of the other four databases (AC-F10-1); migrations apply from scratch and rerun idempotently; on a test append-only table the app role has INSERT and SELECT only and the readonly role cannot write (AC-F09-18, kit part); the transaction helper exposes whether code is running inside an open transaction (the guard that uses it is built in T09); the test harness gives each test file an isolated database cloned from a migrated template.
- **Build:** `infra/db/init` scripts, migration runner per service (plain SQL files under `apps/<service>/migrations`, applied with that service's migrator role), Kysely setup and type checks, transaction helper with an inside-a-transaction context, test harness (template database cloning, truncate with the migrator role), seed runner and the `pnpm db:migrate`, `pnpm db:seed` and `pnpm seed:check` skeletons (`seed:check` verifies fixed cross-service ids once services have seeds).
- **Done when:** AC-F10-1 passes; migrations documented.
- **Verify:** `pnpm db:migrate`, `pnpm test:int` (database suites).
- **Evidence:**

### T09. Redis kit and resilience primitives
- [ ] Done
- **Depends on:** T06, T07
- **Covers:** FR-SEC-5 (rate limits), FR-CONV-3 (dialog store), FR-CONV-7 (counters), NFR-REL-5, NFR-REL-8
- **Spec:** ARCHITECTURE sections 7 and 10; ADR-014; F10 (resilience); F02 dialog state; F06 limits
- **Tests first:** rate limiter (sliding or fixed window, correct under parallel calls, shared across two limiter instances using the same Redis, key prefix per service); TTL store with fake clock; daily counter reset at midnight IST; behavior when Redis is down (general rate limits degrade to per-process limits, login throttling fails closed, dialog state is lost, readiness reports degraded; money paths never depend on Redis); `CircuitBreaker` (closed after success, opens after N consecutive failures, stays open for the configured time without calling, then lets exactly one probe through, re-opens on a failed probe, acts as closed when the store is unavailable; fake clock; two instances sharing one store agree); `Bulkhead` (the 21st concurrent call waits at most 2 s then fails with `overloaded`, slots released on success, error and timeout); `retry` (jittered backoff, idempotent operations only, never exceeds the caller's budget); `callService` wrapper combining timeout, one read retry, breaker and metrics (AC-F10-13), and refusing to run when called inside an open database transaction (the guard of AC-F10-3: a service client invoked inside a transaction throws).
- **Build:** in `packages/platform`: ports `RateLimiter`, `TtlStore`, `Counter`, `BreakerStore` with Redis and in-memory implementations; generic `CircuitBreaker`, `Bulkhead`, `retry` and `callService`; Fastify plugin applying per-user and per-IP limits; `rate_limited_total`, `service_call_duration_seconds` and `service_breaker_state` metric hooks.
- **Done when:** AC-F10-3 and AC-F10-13 pass at unit and integration level; AC-F06-9 (limits across two instances sharing Redis) passes for the limiter.
- **Verify:** `pnpm test:unit`, `pnpm test:int`.
- **Evidence:**

### T10. Messaging kit
- [ ] Done
- **Depends on:** T04, T07, T08
- **Covers:** FR-SVC-3, NFR-CONS-3, NFR-OBS-3 (propagation), NFR-REL-5 (broker loss)
- **Spec:** EVENTS; ADR-017; F10 (messaging); DATA_MODEL (messaging tables); F07 (producer side)
- **Tests first:** outbox writer commits or rolls back with the caller's transaction (fault injected after the insert; AC-F10-9); with RabbitMQ stopped the business change still commits and the relay publishes every row after it returns, each published row confirmed before it is marked; two relays running together lose nothing (duplicates tolerated); inbox: one `event_id` delivered many times and in parallel yields one effect, and a crash between effect and acknowledgement leads to a redelivery without a second effect (AC-F10-10); consumer runner: transient failure retried through the TTL retry queue, five failures dead-letter, invalid payload goes straight to the DLQ with the validation error and the queue keeps flowing (AC-F10-11); broker restart during a burst of 500 events loses none and topology is re-asserted (AC-F10-12); `traceparent` present in the envelope and AMQP headers and continued by the consumer span (AC-F10-14, propagation part); purge jobs; `AuditEvents.record(tx, event)` helper writes an `audit.recorded` outbox row with masked details.
- **Build:** in `packages/platform`: `OutboxWriter`, `OutboxRelay` (claim with `FOR UPDATE SKIP LOCKED`, publisher confirms), `Inbox`, RabbitMQ client with topology assertion, consumer runner, purge jobs, `AuditEvents` helper, `infra/rabbitmq/definitions.json`, metrics `event_outbox_lag_seconds`, `inbox_duplicates_total`, `rabbitmq_queue_messages`, `dlq_messages`.
- **Done when:** AC-F10-9 to AC-F10-12 and the propagation part of AC-F10-14 pass.
- **Verify:** `pnpm test:int`, `pnpm test:reliability` (messaging subset).
- **Evidence:**

### T11. Service authentication kit
- [ ] Done
- **Depends on:** T04, T07
- **Covers:** FR-SVC-2, NFR-ARCH-3, supports NFR-SEC-2
- **Spec:** ADR-018; INTERNAL_API conventions and access matrix; F01 (verification in every service, step-up, key separation); F10 (authentication)
- **Tests first:** user-token verifier accepts a valid EdDSA token and rejects expired, tampered, wrong key, wrong `iss` or `aud`, and the HS256-with-public-key confusion attack (AC-F01-12); JWKS fetch with cache, pinning and continued verification with the cached key when the source is down (AC-F01-15); service tokens: signed by the caller's key, `aud` is the callee, 60 s lifetime, `jti` reuse rejected; an unknown caller or wrong audience returns `401 SERVICE_TOKEN_INVALID`; a valid token for a route outside the caller's matrix row returns `403 SERVICE_FORBIDDEN` (AC-F10-5, AC-F01-16 service part); step-up assertion verifier accepts only the right signature, audience, subject, `transfer_id`, `snapshot_hash` and expiry (AC-F01-13, verifier part); a service refuses to start when a private signing key that belongs to another service is configured (AC-F01-14); requests to `/internal/*` on the public listener return 404; `pnpm keys:generate` writes a fresh key set to an ignored file and prints no private key.
- **Build:** in `packages/platform`: `TokenVerifier` with JWKS client, `ServiceTokenSigner` and `ServiceTokenVerifier`, access-matrix enforcement hook for the internal listener (reads `packages/shared/service-acl`), `StepUpVerifier`, key-material loaders with shape checks, `tools/keys-generate.mjs`, test helpers that mint tokens with test keys.
- **Done when:** AC-F01-12 to AC-F01-14, AC-F01-16 (kit level) and AC-F10-5 pass.
- **Verify:** `pnpm test:unit`, `pnpm test:int`, `pnpm test:security` (auth kit subset).
- **Evidence:**

### T12. Compose base, CI skeleton and the sample-service proof
- [ ] Done
- **Depends on:** T08, T09, T10, T11
- **Covers:** FR-OPS-1 (partial), FR-OPS-3, FR-SEC-6, NFR-SEC-4, NFR-SEC-5, FR-SVC-5 (independence)
- **Spec:** F09 runtime; F10 (independence, replica safety); TESTING section 9; ARCHITECTURE section 13
- **Tests first:** a CI workflow lint (actionlint if available) and a script test that every verification command from TESTING section 8 appears in CI or is explicitly listed as manual; compose config validation (`docker compose config`); the sample service in the kit's test folder, started twice against the same Postgres, Redis and RabbitMQ, exercises skeleton, token verification, an internal route with a service token, an outbox event and an inbox consumer end to end, with no duplicate effects from the relay, consumer or scheduled job (AC-F10-16, AC-F10-18); a container user check (non-root).
- **Build:** `docker-compose.yml` with Postgres 16 (init scripts from T08), Redis 7, RabbitMQ 3 with management UI on the private network and the definitions from T10, health checks, a shared multi-stage Dockerfile template for services (non-root user); `.github/workflows/ci.yml` with stages lint, typecheck, arch, unit, integration with Postgres, Redis and RabbitMQ service containers (one job per service once they exist), build, `pnpm audit --audit-level=high`, secret scan (gitleaks); `.env.example`.
- **Done when:** `docker compose up postgres redis rabbitmq` is healthy (if Docker is available; otherwise say not run); CI file validates; AC-F10-16 and AC-F10-18 pass for the sample service. CI cannot be proven green until pushed: report it as "not run" until a real run exists.
- **Verify:** `docker compose config`, local `pnpm verify` for stages built so far.
- **Evidence:**

**Review point A.** Present: repo layout and the rules `pnpm arch` enforces, the platform kit (what it provides, what it deliberately does not), command list, what ran and what did not.

---

## Phase B: Identity (`edge`)

### T13. Login, throttling and token signing
- [ ] Done
- **Depends on:** T08, T09, T10, T11
- **Covers:** FR-AUTH-1, FR-AUTH-3, FR-AUTH-6, NFR-SEC-2, FR-AUD-4 (producer side, `edge`)
- **Spec:** F01; API authentication routes; DATA_MODEL `edge_db`
- **Tests first:** AC-F01-1, 2, 3 (login, byte-identical failures, throttling with fake clock), 6 and 7 for `edge` routes (direct tests; T16 turns them into the reusable framework), 10 (login success, failure and throttle events), 11 (password hash part), 12 (tokens issued by `edge`); `GET /.well-known/jwks.json` serves only the public key; argon2id parameters; dummy-hash path for unknown emails; throttling fails closed to a per-process counter when Redis is down; each auth event is exactly one `audit.recorded` outbox row in the same transaction as the action (AC-F07-2 for `edge`, AC-F07-8 for masked details).
- **Build:** `apps/edge`: `edge_db` migrations (`users`, `refresh_tokens`, `event_outbox`), user service, password hashing, EdDSA token signer with `loc` claim, JWKS route, login route with the T09 limiters, seed users with fixed ids (3 customers, 1 support, 1 admin).
- **Done when:** AC-F01-1, 2, 3, 6, 7 (edge routes), 10 (login and throttle events), 11 (password part) and 12 pass; `AUTH_*` errors match the API table.
- **Verify:** `pnpm test:unit`, `pnpm test:int`, `pnpm test:security` (auth subset).
- **Evidence:**

### T14. Refresh rotation and logout
- [ ] Done
- **Depends on:** T13
- **Covers:** FR-AUTH-2, NFR-SEC-2
- **Spec:** F01
- **Tests first:** refresh rotates and the old token fails; reuse of a rotated token revokes the whole family and records `auth.refresh_reuse_detected`; logout revokes the family; refresh tokens stored only as hashes (database inspection test); concurrent refresh with the same token yields one success; the new access token carries the current `loc` claim.
- **Build:** refresh token repository, rotation with row lock, family revocation, endpoints, audit events through the outbox.
- **Done when:** AC-F01-4, 5, 10 (refresh, reuse and logout events) and 11 (refresh-token hash part) pass.
- **Verify:** `pnpm test:int`, `pnpm test:security`.
- **Evidence:**

### T15. Profile, PIN and step-up assertion
- [ ] Done
- **Depends on:** T13
- **Covers:** FR-AUTH-5, FR-NLU-6 (preference storage)
- **Spec:** F01 (transaction PIN, step-up); ADR-018 section 3; API `/v1/me` routes
- **Tests first:** set and change PIN rules (`PUT /v1/me/pin`); wrong PIN counter, lock after three attempts for 15 minutes, correct PIN while locked rejected, unlock by fake clock and counter reset (AC-F01-9, edge part); PIN never logged or audited in clear; the step-up assertion issued after a correct PIN carries `aud` `transfers`, the `sub`, the given `transfer_id` and `snapshot_hash`, and expires in 60 s (AC-F01-13, issuing part); a wrong PIN returns `PIN_INVALID` and increments the counter (that nothing is forwarded upstream is tested in T34); `preferred_locale` get and set, effective in the token after refresh (AC-F01-17); PIN events recorded through the outbox (AC-F01-10, PIN events).
- **Build:** PIN service (hashing, counters in `edge_db` so locking survives Redis loss), step-up signer, profile endpoints, seed PINs for demo users.
- **Done when:** AC-F01-9 (edge part), AC-F01-10 (PIN events), AC-F01-11 (PIN hash part), AC-F01-13 (issuing) and AC-F01-17 pass.
- **Verify:** `pnpm test:int`, `pnpm test:security`.
- **Evidence:**

### T16. Authorization test framework
- [ ] Done
- **Depends on:** T07, T11, T13
- **Covers:** FR-AUTH-4, NFR-SEC-1 (BOLA, BFLA)
- **Spec:** F01; TESTING sections 4 and 5
- **Tests first:** a generic matrix test that, for every route a service registers, calls it as anonymous, customer, another customer, support and admin and checks the declared policy; an ownership registry test that fails when a user-owned route has no registered ownership test and, for such routes, expects 404 identical to a random id for another customer's object (AC-F01-8); a test that fails when a route is added without a policy (AC-F01-6); the same harness runs against the sample service.
- **Build:** in `packages/platform/testing`: matrix runner, ownership-test registry, test principals and token minting with test keys; `pnpm test:security` wiring that every service's security tests plug into.
- **Done when:** AC-F01-6, 7 and 8 pass for `edge` and the sample service, and the registry check is wired in `test:security`.
- **Verify:** `pnpm test:security`.
- **Evidence:**

---

## Phase C: Audit service

### T17. Audit ingestion and the hash chain
- [ ] Done
- **Depends on:** T08, T10, T04, T05
- **Covers:** FR-AUD-1 (service), FR-AUD-2, FR-AUD-3, FR-AUD-4, NFR-CONS-2 (lag metric)
- **Spec:** F07 (ingestion, entry shape and chaining, permissions); ADR-009, ADR-019; EVENTS
- **Tests first:** canonicalization vectors (committed fixture; AC-F07-3); chain linearity with 4 producers publishing 1,000 events in parallel (AC-F07-4); duplicate `event_id` delivered ten times yields one entry; an invalid payload goes to the DLQ without retries and the consumer keeps going (AC-F07-13); `occurred_at` preserved for out-of-order delivery and `ingested_at` reflects arrival (AC-F07-16); privileged tamper tests (update detected at the right id, middle delete detected; AC-F07-5, 6 middle part); `audit` app-role permission failures and trigger (AC-F07-7), and other services' roles cannot connect to `audit_db`; stopped-and-restarted `audit` catches up with 50 queued events without duplicates and `audit_lag_seconds` falls below the threshold (AC-F07-14); details redaction on receipt.
- **Build:** `apps/audit`: `audit_db` migrations (`audit_log`, `inbox`, `anchors`), advisory-lock append, consumer on queue `audit.ingest`, permissions and triggers, `audit_lag_seconds` gauge and histogram, direct-write path for the service's own `admin.view_audit` and `audit.verify` entries.
- **Done when:** AC-F07-3, 4, 5, 6 (middle), 7, 13, 14 and 16 pass.
- **Verify:** `pnpm test:int`, `pnpm test:reliability` (audit subset).
- **Evidence:**

### T18. Audit verification, anchors, admin API and completeness check
- [ ] Done
- **Depends on:** T17, T16
- **Covers:** FR-AUD-1 (viewer), FR-AUD-3, FR-ADM-1 (audit part), supports NFR-CONS-2
- **Spec:** F07 (verification, anchors, completeness, admin viewer); API admin audit routes
- **Tests first:** deleting the last row is detected against the latest anchor (AC-F07-6); no sensitive substring in any entry across the test run (AC-F07-8); verification of 10,000 entries under 5 s, streaming (AC-F07-9, marked as a benchmark); the hourly verifier writes `audit.verify`, sets `audit_verification_ok`, and with a corrupted chain the alert condition is true (AC-F07-10); customers receive `AUTH_FORBIDDEN` on every audit route and an admin read writes `admin.view_audit` directly (AC-F07-11); anchor lines hourly and at shutdown with a fake clock, and a wrong `expected_anchor` makes verification fail with reason `anchor_mismatch` (AC-F07-12); the completeness function reports per-producer differences between outbox rows and chain entries (AC-F07-15, unit level with two fake outboxes).
- **Build:** verify endpoint, scheduled verifier, anchor writer (table, append-only file, log stream), `GET /v1/admin/audit` and `GET /v1/admin/audit/verify`, completeness function exported for the sweep tool.
- **Done when:** AC-F07-6, 8, 9, 10, 11, 12 and the unit level of 15 pass; AC-F07-1 and AC-F07-2 complete as producers land.
- **Verify:** `pnpm test:int`, `pnpm test:security`.
- **Evidence:**

**Review point B.** Present: the identity model (who signs, who verifies), the audit proof (tamper tests), what happens when Redis, the broker or `audit` is down.

---

## Phase D: Wallet service

### T19. Ledger and hold domain
- [ ] Done
- **Depends on:** T03
- **Covers:** FR-XFER-5 (domain rules), NFR-REL-1 (invariants)
- **Spec:** ARCHITECTURE section 6.1 (ledger, wallet command table, hold state machine); ADR-005, ADR-016; F05 AC-F05-35, 37
- **Tests first:** every row of the hold, settle and release tables in ARCHITECTURE and `INTERNAL_API.md` as a pure-function test (results, ledger entries, balance changes, repeated commands change nothing, conflicting commands return conflict, release before hold produces a `VOIDED` tombstone and a later hold is refused); property tests with fast-check over random sequences of commands (hold, settle, release, duplicates, out of order, several transfers; at least 1,000 sequences) that keep all ledger invariants and the hold state machine legal (AC-F05-37); no negative `available` or `held`; amounts are integers and bounded.
- **Build:** `apps/wallet/src/domain`: money and ledger types, wallet aggregate, `HoldService` pure decision functions that return the ledger entries and state change to persist.
- **Done when:** the domain part of AC-F05-35 and AC-F05-37 pass; module has at least 90% branch coverage.
- **Verify:** `pnpm test:unit`.
- **Evidence:**

### T20. Wallet persistence and saga commands
- [ ] Done
- **Depends on:** T19, T08, T10, T11
- **Covers:** FR-XFER-13 (wallet side), FR-XFER-5, NFR-REL-1, FR-AUD-4 (producer side, `wallet`), NFR-SCAL-2 (wallet part)
- **Spec:** DATA_MODEL `wallet_db`; INTERNAL_API wallet routes; ARCHITECTURE section 6.1; F05 AC-F05-35 to 38
- **Tests first:** integration tests against real Postgres for each row of the hold, settle and release tables including HTTP status and body (AC-F05-35); 100 parallel identical holds produce one HOLD entry, a repeated hold for a `REJECTED` one returns the same 422, settle and release must carry the same amount as the hold (the transfer total), parallel holds for different transfers exceeding the balance produce some `REJECTED` and the balance never goes negative (AC-F05-36); fault injected after the ledger insert rolls back hold row, ledger entry, balances and outbox rows together (AC-F05-38, AC-F07-2 for `wallet`); only `transfers` may call the internal routes, others get 403, no token gets 401 (AC-F01-16 for `wallet`); `ledger_entries` UPDATE and DELETE blocked by trigger and role; audit events `wallet.hold_*` appear in the outbox with masked details; checks reject negative balances and non-INR currency.
- **Build:** `apps/wallet`: `wallet_db` migrations (`wallets`, `holds`, `ledger_entries`, `event_outbox`), repositories, command use cases running in one local transaction with the wallet row lock, internal routes `POST /internal/v1/holds`, `/holds/:transfer_id/settle`, `/holds/:transfer_id/release`, seed wallets with opening credits.
- **Done when:** AC-F05-35 to 38 and the `wallet` parts of AC-F01-16 and AC-F07-2 pass.
- **Verify:** `pnpm test:int`, `pnpm test:reliability` (wallet subset), `pnpm test:security`.
- **Evidence:**

### T21. Wallet reads and transaction history
- [ ] Done
- **Depends on:** T20, T16
- **Covers:** FR-INFO-1, FR-INFO-2
- **Spec:** F04 (balance, history); API wallet routes; DATA_MODEL `v_transactions`
- **Tests first:** AC-F04-1 (data part), AC-F04-2 (every filter against seeded data, stable cursor pagination, hard maximum 50), AC-F04-14 (HELD is PROCESSING, SETTLED is COMPLETED, RELEASED is FAILED, REJECTED and VOIDED hidden); another customer's data is a 404 (AC-F01-8 for `wallet`); transaction notes returned as plain text (AC-F04-11, API part); the internal balance route for `transfers` returns the right values and rejects other callers; response schemas contain no internal fields.
- **Build:** `v_transactions` view, `GET /v1/wallet`, `GET /v1/transactions`, `GET /internal/v1/wallets/:user_id/balance`.
- **Done when:** AC-F04-2, 11 (API part) and 14 and the data part of AC-F04-1 pass.
- **Verify:** `pnpm test:int`, `pnpm test:security`, `pnpm test:contract`.
- **Evidence:**

### T22. Beneficiaries
- [ ] Done
- **Depends on:** T20, T16
- **Covers:** FR-NLU-8 (data), FR-XFER-1 (beneficiary ownership), FR-AUD-4 (`beneficiary.created`)
- **Spec:** API beneficiary routes; INTERNAL_API beneficiary lookup; DATA_MODEL `beneficiaries`; F03 recipient resolver (data needs)
- **Tests first:** create and list (the list returns `id`, `display_name`, `aliases` and the masked account); account number never returned, only the masked form, and never logged; duplicate display names allowed on purpose; Devanagari and Latin aliases stored; another user's beneficiary is a 404 on the public route; the internal lookup returns `rail_token` only to `transfers` and only for the right `user_id`, 404 otherwise; no public response contains `rail_token` (OWASP API3); `beneficiary.created` audit event through the outbox; seed data includes two Rahuls, a Rohan, a Priya and the Devanagari alias.
- **Build:** `beneficiaries` migration, repository, routes `GET` and `POST /v1/beneficiaries`, internal lookup route, seed.
- **Done when:** the criteria above pass and the ownership registry covers the new routes.
- **Verify:** `pnpm test:int`, `pnpm test:security`.
- **Evidence:**

**Review point C.** Present: the ledger and hold invariants, the property-test results, how a hold is made idempotent and why a release can arrive before a hold.

---

## Phase E: Transfers and the saga

### T23. Mock payment rail
- [ ] Done
- **Depends on:** T07, T06
- **Covers:** FR-XFER-6 (counterparty), supports NFR-REL-1
- **Spec:** API mock-rail section; ARCHITECTURE section 3; F05 rail behavior
- **Tests first:** payouts are idempotent per `client_reference` (same reference returns the original outcome, count stays 1); each fault mode behaves as specified (`latency`, `error_5xx`, `timeout`, `lost_response` executes the payout and drops the response, `duplicate_response`, `reject`) with `probability` and `latency_ms`; every request except `/healthz` needs the right `X-Rail-Key` (missing or wrong gives 401, compared in constant time); faults can be switched only when `RAIL_FAULTS_ENABLED=true`; the payout count counts payouts that completed (moved money); `GET /payouts/by-reference/:id` returns status or 404; `GET /admin/payouts/count` returns the executed count; invalid bodies are rejected; the rail never logs `beneficiary_token`.
- **Build:** `apps/mock-rail` on the service skeleton (no database; in-memory with optional file persistence so a restart can be tested), fault controller, rail contract suite that the real rail client (T29) will also run.
- **Done when:** the criteria above pass and the contract suite is exported for reuse.
- **Verify:** `pnpm test:int`, `pnpm test:contract` (rail subset).
- **Evidence:**

### T24. Transfer state machine, events and repository
- [ ] Done
- **Depends on:** T08, T10, T04
- **Covers:** FR-XFER-5, FR-XFER-8 (states), FR-AUD-1 (transfer events), FR-AUD-4 (producer side, `transfers`)
- **Spec:** ARCHITECTURE section 6.2 (states and transitions); DATA_MODEL `transfers_db`; F05 rules of the road, AC-F05-26, AC-F05-34
- **Tests first:** state machine unit tests enumerating every status pair (only the transitions in ARCHITECTURE section 6.2 succeed; illegal ones raise and persist nothing; terminal states are final; `NEEDS_REVIEW` remembers `review_from_status`; AC-F05-26); integration tests where every transition writes in one transaction a `transfer_events` row, the next saga command when applicable, one `transfer.status_changed` outbox row and one `audit.recorded` outbox row, and a fault injected after any of those inserts rolls all back (AC-F05-34 outbox part, AC-F07-2 for `transfers`); snapshot immutability (trigger plus application check); `status_since` set by every transition; a partial unique index allows at most one PREPARED transfer per user; `transfers.reference` uniqueness and format; `saga_commands` uniqueness per transfer and type while unprocessed; `transfer_events` is append-only.
- **Build:** `apps/transfers`: `transfers_db` migrations (`transfers`, `transfer_events`, `saga_commands`, `event_outbox`; `idempotency_keys` in T25), domain state machine, transition use case that does all inserts in one transaction, repository with `FOR UPDATE` locking by transfer id.
- **Done when:** AC-F05-26 passes, the outbox part of AC-F05-34 passes and every transition has an event, a status event and an audit event.
- **Verify:** `pnpm test:unit`, `pnpm test:int`.
- **Evidence:**

### T25. Idempotency store
- [ ] Done
- **Depends on:** T24
- **Covers:** FR-XFER-4
- **Spec:** API idempotency and confirm semantics; DATA_MODEL `idempotency_keys`; F05 AC-F05-6 to 9; ADR-006
- **Tests first:** claim, replay with the stored body and `Idempotent-Replay: true`, same key with different payload returns `IDEMPOTENCY_KEY_REUSED`, concurrent claim of the same key waits up to 5 s then returns `IDEMPOTENCY_IN_PROGRESS`, 100 parallel claims yield exactly one owner, a rejected attempt releases the key so the client can retry with the same key, keys expire after 24 hours (fake clock), claim and result storage commit with the caller's transaction.
- **Build:** `idempotency_keys` migration and store with `(user_id, scope, key)` uniqueness, request-hash comparison, in-progress handling.
- **Done when:** the store-level behavior of AC-F05-6, 7 and 8 passes.
- **Verify:** `pnpm test:int`.
- **Evidence:**

### T26. Prepare, cancel and limits
- [ ] Done
- **Depends on:** T24, T25, T22, T21
- **Covers:** FR-XFER-1, FR-XFER-2, FR-XFER-12, FR-XFER-8 (cancel, supersede), NFR-REL-8 (service client)
- **Spec:** F05 behavior 1, 2, 7; API transfer routes; INTERNAL_API (`transfers` routes); ADR-014
- **Tests first:** AC-F05-1, 2, 3 (including two prepares racing: one PREPARED remains), 24 (daily limit with IST day boundaries at 23:59:59 and 00:00:00 and the status set from F05), AC-F05-4 (golden summary templates in en, hi and hi-Latn; the template catalog entries and the pure `renderTransferSummary` live in `packages/shared`); AC-F05-16 (wallet unreachable gives `503 DEPENDENCY_UNAVAILABLE` and creates nothing; after 5 consecutive failures the breaker opens and calls fail fast); limits configurable; expiry timestamp from the database clock; `requires_pin` set at the threshold; the public prepare route rejects `origin_conversation_id` (unknown property) while the internal route stores it; cancel works for PREPARED only; the beneficiary name and masked account are copied into the snapshot and `rail_token` is stored but never returned; the two wallet lookups run in parallel before the local transaction and the per-user advisory lock serializes limit checks; wallet client tested against the contract fake of the wallet routes.
- **Build:** `WalletClient` (balance pre-check and beneficiary lookup, 3 s timeout, one read retry, breaker via `callService`), prepare and cancel use cases, routes `POST /v1/transfers`, `GET /v1/transfers`, `GET /v1/transfers/:id`, `POST /v1/transfers/:id/cancel`, internal route `POST /internal/v1/transfers`, summary templates, daily-limit query.
- **Done when:** AC-F05-1 to 4, 16 and 24 pass; no ledger rows are written by prepare and the wallet receives no hold request.
- **Verify:** `pnpm test:int`, `pnpm test:contract`, `pnpm test:security`.
- **Evidence:**

### T27. Confirm: accept and typed channel
- [ ] Done
- **Depends on:** T26, T11, T15
- **Covers:** FR-XFER-3 (API channel), FR-XFER-4, FR-XFER-5, FR-XFER-10, FR-AUTH-5 (enforcement), FR-XFER-13 (accept)
- **Spec:** F05 behavior 3, 4; F01 (step-up); API confirm semantics; INTERNAL_API `confirm-typed`; ADR-008, ADR-016, ADR-018
- **Tests first:** AC-F05-5 (202 CONFIRMED, exactly one `wallet.hold` command, one transfer event, one status event, one audit event; **confirm still returns 202 with the wallet stopped**; a fault injected after the command insert rolls everything back), AC-F05-6, 7, 8 (100 parallel confirms with one key produce one command), 9 (20 parallel confirms with different keys: one 202, the rest `TRANSFER_NOT_CONFIRMABLE`), 11 (expiry by database clock even if the job has not run; cancelled transfer), 12 (wrong hash; the insufficient-funds part is completed in T28), 13 and AC-F01-13 (assertion verification: `PIN_REQUIRED` without a valid assertion, refused for another transfer, snapshot hash, user, expired, or signed by a key other than `edge`'s), AC-F01-9 (confirm-route part); the internal `confirm-typed` route requires the service token of `assistant` and the user token, derives the key `typed:{message_id}`, and is refused with `PIN_REQUIRED` when the transfer requires a PIN; cancel and confirm racing on one transfer: exactly one wins; the daily limit is re-checked under the per-user lock at confirm (a prepare and a confirm racing cannot exceed it).
- **Build:** confirm use case (one local transaction: claim key, lock transfer row, check owner, status, expiry, hash and assertion, set CONFIRMED, insert `wallet.hold` command, events, store response), public route, internal typed route, step-up verification wiring.
- **Done when:** AC-F05-5 to 9, 11, 13, AC-F01-9 (confirm part) and AC-F01-13 pass.
- **Verify:** `pnpm test:int`, `pnpm test:security`, `pnpm test:reliability` (concurrency subset).
- **Evidence:**

### T28. Saga worker and the hold step
- [ ] Done
- **Depends on:** T27, T20
- **Covers:** FR-XFER-13, NFR-SCAL-2, NFR-REL-8
- **Spec:** F05 behavior 5 (worker, step 1), failure matrix; ARCHITECTURE section 6.3; ADR-016
- **Tests first:** AC-F05-10 (hold part: two confirmed transfers that together exceed the balance are both accepted with 202; one reaches HOLD_PLACED and one ends FAILED with `INSUFFICIENT_FUNDS` and no HOLD entry; the first one's completion is asserted in T30), AC-F05-12 (balance dropped before the hold: FAILED, no HOLD entry), AC-F05-22 (two workers racing for one command produce one hold), AC-F05-31 (retry and backoff part: wallet unreachable, confirm still 202, the command backs off and retries with a fake clock without changing status, and after the wallet returns exactly one hold; after 30 minutes unreachable the transfer becomes NEEDS_REVIEW with an alert; the admin-resolve tail of this criterion is tested in T31), AC-F05-32 (hold applied but response lost: the retry returns the existing hold, one HOLD entry), AC-F05-41 (a refused hold goes through RELEASING and a tombstone to FAILED with `HOLD_REJECTED`, a repeated rejected hold returns the same 422); the table of hold answers (201, 200, 422 first and repeated, 409 `HOLD_VOIDED`, 200 with an unexpected state, other 4xx, timeout, 5xx, breaker open); the state guard discards a late answer when the status moved; lease expiry lets another worker retry a crashed worker's command.
- **Build:** saga worker loop (claim with `FOR UPDATE SKIP LOCKED` and lease, execute outside any transaction, apply answer in a new guarded transaction, mark processed), backoff schedule, command executor interface, `wallet.hold` executor using the `WalletClient`, 30-minute review rule, metrics `saga_command_lag_seconds`, `saga_step_duration_seconds`.
- **Done when:** AC-F05-10 (hold part), 12, 22, 31 (retry part), 32 and 41 pass with the fake wallet from the contract and with the real wallet routes in a two-service integration test.
- **Verify:** `pnpm test:int`, `pnpm test:reliability`.
- **Evidence:**

### T29. Saga step: payout through the rail with breaker and retries
- [ ] Done
- **Depends on:** T28, T23, T09
- **Covers:** FR-XFER-6, NFR-REL-3, NFR-REL-6, NFR-SCAL-2
- **Spec:** F05 behavior 5 (step 2, rail circuit breaker); API mock-rail; ADR-014, ADR-016
- **Tests first:** the rail client passes the rail contract suite from T23; AC-F05-17 (happy path up to SETTLING: statuses in order with an event and an audit event each, exactly one payout at the rail), AC-F05-18 (rail REJECTED moves to RELEASING with the mapped failure code), AC-F05-19 (timeouts: 3 retries with backoff and jitter on a fake clock, then PENDING_UNKNOWN with the hold intact), AC-F05-20 (`lost_response`: the payout is executed, the response dropped, status becomes PENDING_UNKNOWN and a `rail.reconcile` command is queued), AC-F05-29 (after 5 consecutive failures the breaker opens, further `rail.submit` commands make no rail call and their `attempts` do not increase, holds stay, `rail_breaker_state` reports open; after 30 s one probe, success closes it and the queue drains with each transfer completing once), AC-F05-30 (failed probe keeps it open; Redis stopped makes it act as closed), AC-F05-27 (Redis stopped does not change correctness); 4xx validation errors map to `RAIL_INVALID` and do not count as breaker failures.
- **Build:** `RailClient` (5 s timeout, schema-validated responses) wrapped in the `CircuitBreaker`, `rail.submit` executor, retry and `available_at` rescheduling that does not consume attempts while the breaker is open, `rail_breaker_state` and `rail_requests_total` metrics, failure-code mapping.
- **Done when:** AC-F05-17 and 18 (up to the point where the wallet command is queued), 19, 20 (up to PENDING_UNKNOWN), 27, 29 and 30 pass.
- **Verify:** `pnpm test:int`, `pnpm test:reliability`.
- **Evidence:**

### T30. Saga steps: settle and release (compensation)
- [ ] Done
- **Depends on:** T29, T20
- **Covers:** FR-XFER-13, NFR-REL-1
- **Spec:** F05 behavior 5 (steps 3a and 3b); ARCHITECTURE section 6.3; ADR-016
- **Tests first:** AC-F05-10 (completion: of two transfers competing for the balance, the first ends COMPLETED and the wallet holds exactly one amount), AC-F05-17 (to COMPLETED; the wallet hold ends SETTLED, ledger invariants hold) and AC-F05-18 (to FAILED; the hold ends RELEASED and `available` is restored), AC-F05-21 (worker killed after the rail call and before recording, then restarted: COMPLETED with exactly one SETTLE entry and one payout), 22 (two workers race on settle or release: one effect), a wallet that is down for minutes during settle or release is retried without limit and the stuck alert condition appears after 15 minutes (fake clock); 409 `HOLD_STATE_CONFLICT` goes to NEEDS_REVIEW with an alert; every status change publishes exactly one `transfer.status_changed` event whose payload validates against the shared schema (AC-F05-34).
- **Build:** `wallet.settle` and `wallet.release` executors, retry without limit with a 5-minute backoff cap, completion of the status-event publishing for all statuses, `transfer_stuck_count` gauge.
- **Done when:** AC-F05-10 (completion), 17, 18, 21, 22 (settle and release) and 34 pass in a two-service integration test with the real wallet.
- **Verify:** `pnpm test:int`, `pnpm test:reliability`.
- **Evidence:**

### T31. Reconciliation, expiry and manual resolution
- [ ] Done
- **Depends on:** T30
- **Covers:** FR-XFER-7, FR-XFER-8 (expiry), FR-ADM-1 (transfer actions)
- **Spec:** F05 behavior 6, 7, 8; API admin transfer routes
- **Tests first:** AC-F05-20 (reconcile finds the payout by reference and ends COMPLETED with one payout), reconcile schedule (30 s, 1 min, 2 min, 5 min, then every 5 min), a 404 from the rail moves PENDING_UNKNOWN to SUBMITTED and queues a new `rail.submit` (the rail stays idempotent), admin reconcile is allowed in SUBMITTED, PENDING_UNKNOWN and NEEDS_REVIEW (payout attempted) and refused otherwise; AC-F05-11 (expiry job sets EXPIRED; confirm after expiry returns `TRANSFER_EXPIRED` even if the job has not run); AC-F05-23 (PENDING_UNKNOWN for 24 hours becomes NEEDS_REVIEW and raises the alert condition; admin `resolve` requires a reason, is audited, applies the ledger effect exactly once, is refused for any other status, and `COMPLETED` is refused when no payout was attempted), AC-F05-42 (every allowed and refused combination of origin and outcome, the rail check, `force`, `TRANSFER_BUSY`, the SETTLING and RELEASING re-queue), the tail of AC-F05-31 (after 30 minutes with the wallet unreachable, admin resolve `FAILED` ends in FAILED and a late hold command is refused with `HOLD_VOIDED` and ignored by the state guard); a release for a transfer with no hold writes a tombstone; admin routes `GET /v1/admin/transfers`, `GET /v1/admin/transfers/:id`, `POST .../reconcile` and `.../resolve` are admin-only (role matrix); `admin.reconcile` and `admin.resolve` audit events.
- **Build:** `rail.reconcile` executor with schedule, expiry job, manual resolve use case, admin routes.
- **Done when:** AC-F05-11, 20, 23, 42 and the tail of 31 pass; the role matrix covers the admin routes.
- **Verify:** `pnpm test:int`, `pnpm test:security`.
- **Evidence:**

### T32. Saga watchdog and consistency sweep
- [ ] Done
- **Depends on:** T31, T18
- **Covers:** FR-XFER-13 (watchdog), NFR-CONS-1 (sweep tool), supports FR-AUD-4 (completeness)
- **Spec:** F05 behavior 9; ARCHITECTURE sections 6.3 and 6.4; DATA_MODEL (`sahayak_sweep` role); F07 completeness
- **Tests first:** AC-F05-40 (24-hour horizons for HOLD_PLACED, SUBMITTED and PENDING_UNKNOWN and the 30-minute horizon for CONFIRMED, measured from `status_since` and `hold_placed_at` with a fake clock, even with the rail or wallet breaker open), AC-F05-33 (a pending command deleted by a privileged connection is re-queued within 90 seconds of fake time, the transfer completes, `saga_watchdog_requeued_total` increments; with no lost commands the counter stays at zero across the whole suite); the watchdog thresholds per status (30 s and 2 min) and that it queues exactly the command each status expects; the sweep tool with seeded inconsistencies, one per invariant in ARCHITECTURE section 6.4 (a hold with no transfer, a COMPLETED transfer whose hold is not SETTLED, a FAILED transfer whose hold is HELD, a COMPLETED transfer without exactly one completed payout at the rail, a FAILED transfer with a completed payout, a wallet balance that differs from the ledger, an `audit.recorded` outbox row in any service never ingested), each reported with the offending ids and a non-zero exit; a clean database exits zero.
- **Build:** watchdog job in `transfers` (re-queueing and horizons), `tools/sweep-consistency.mjs` (reads `wallet_db`, `transfers_db`, the outbox tables of `edge_db` and `assistant_db` and `audit_log` through the test-only `sahayak_sweep` role, and the rail's payout counts through its test endpoint; refuses to run unless the environment is local or test), `pnpm sweep:consistency`.
- **Done when:** AC-F05-33 and AC-F05-40 pass and the sweep reports every seeded inconsistency and nothing on clean data.
- **Verify:** `pnpm test:int`, `pnpm sweep:consistency` (against the integration databases).
- **Evidence:**

### T33. Transfers reliability suite
- [ ] Done
- **Depends on:** T30, T31, T32
- **Covers:** NFR-REL-1, NFR-REL-5, NFR-SCAL-2, NFR-PERF-4, FR-XFER-9 (data truth)
- **Spec:** F05 AC-F05-8 to 10, 17 to 22, 24 to 28; TESTING reliability family
- **Tests first:** crash test that kills the saga worker process after the rail call and before the database update, then restarts it (AC-F05-21); property test over random sequences of prepare, confirm, cancel, expire, wallet answers (ok, insufficient, timeout, duplicate, late), rail outcomes, reconcile and worker restarts against fakes of the wallet and the rail, asserting at most one hold and one payout per transfer and eventual terminal status or NEEDS_REVIEW (AC-F05-25); state-machine and ledger invariants swept after every scenario; Redis stopped during confirm and during the saga (AC-F05-27); a rail outage that opens the breaker and drains on recovery (AC-F05-29); confirm API latency p95 at most 300 ms at 50 concurrent users with the wallet and rail excluded (AC-F05-28, reported with machine details, not assumed).
- **Build:** test utilities only (process control, fault toggles, simulated wallet and rail); fix any defect found in earlier tasks by adding a failing test first.
- **Done when:** `pnpm test:reliability` passes and the report lists the number of random sequences run.
- **Verify:** `pnpm test:reliability`.
- **Evidence:**

---

## Phase F: Gateway and system proof

### T34. Edge gateway routing
- [ ] Done
- **Depends on:** T14, T15, T16, T21, T22, T26, T27, T18
- **Covers:** FR-SVC-2 (public side), FR-SEC-5 (CORS, per-IP limits), NFR-ARCH-3 (exposure)
- **Spec:** ARCHITECTURE sections 3 and 9; API conventions (routing, `DEPENDENCY_UNAVAILABLE`); F01 (public routing, PIN step-up); F06 limits; ADR-018
- **Tests first:** the explicit route table forwards only allowlisted public prefixes to the owning service with the user token, `X-Request-Id` and `traceparent`; a route not in the table returns 404 even if a service implements it; `/internal/*` returns 404 through `edge` (AC-F01-16); confirm with a PIN above the threshold is verified in `edge` and forwarded with a step-up assertion that `transfers` accepts, a wrong PIN never reaches `transfers`, and a confirm without a PIN is forwarded without an assertion and answered `PIN_REQUIRED` (AC-F05-13 end to end with fakes); an upstream timeout, 5xx or open breaker returns `503 DEPENDENCY_UNAVAILABLE` naming only that service while routes of other services keep working; the 121st request in a minute from one IP returns 429 (AC-F06-9); CORS and security headers on `edge` (AC-F06-10); streamed responses are passed through without buffering; authorization matrix and ownership tests run through `edge` against fakes of the upstream services (AC-F01-7, 8).
- **Build:** `apps/edge` gateway module (route table from the shared registry, forwarding with `callService`, stream pass-through, PIN step-up handling, per-IP limiter, upstream error mapping), merged `GET /v1/openapi.json`.
- **Done when:** the criteria above pass; the route table matches the shared registry (drift test).
- **Verify:** `pnpm test:int`, `pnpm test:contract`, `pnpm test:security`.
- **Evidence:**

### T35. Full compose stack and system-test harness
- [ ] Done
- **Depends on:** T34, T32, T23, T12
- **Covers:** FR-OPS-1, FR-SVC-1, FR-SVC-5, NFR-OPS-1 (stack definition)
- **Spec:** F09 runtime; F10 (isolation, health); TESTING sections 2, 3, 8; ARCHITECTURE section 13
- **Tests first:** a compose smoke test: `docker compose up` brings `proxy`, `edge`, `wallet`, `transfers`, `audit`, `mock-rail`, Postgres, Redis and RabbitMQ to healthy in dependency order, the seeded demo user logs in through the proxy, prepares a transfer to a beneficiary, confirms with the PIN and sees COMPLETED; `/internal/*` through the proxy returns 404 (AC-F10-5 at stack level); the database-credential isolation test runs against the real containers (AC-F10-1); `pnpm seed:check` verifies that the fixed ids (users, wallets, beneficiaries) line up across services; `pnpm stack:reset` restores seed data in all five databases, clears Redis and purges queues, and refuses to run unless the environment is marked local or test.
- **Build:** compose services for every app built so far (assistant and web are added by their own tasks), proxy configuration (round-robin, no sticky sessions, serves `web` later), per-service seed, `pnpm seed:check`, `pnpm stack:reset`, the `tools/system` harness: Docker control (stop, kill, pause, start, wait for healthy), helpers to wait until all transfers are terminal, fixtures for tokens, and `pnpm test:system` wiring.
- **Done when:** the smoke test passes (or is reported "not run" with the reason if Docker is unavailable) and the harness can stop and restart any container.
- **Verify:** `docker compose up`, `pnpm test:system -- smoke`, `pnpm seed:check`.
- **Evidence:**

### T36. System suite: kill at every saga step
- [ ] Done
- **Depends on:** T35
- **Covers:** NFR-CONS-1, NFR-CONS-2, NFR-CONS-3, NFR-PERF-5, NFR-REL-1 (system), FR-AUD-4 (end-to-end completeness), NFR-SCAL-2 (replicas)
- **Spec:** F05 failure matrix and AC-F05-39; F07 AC-F07-14, 15; F10 AC-F10-12, 18; TESTING families 14 to 17
- **Tests first:** for every row of the failure matrix in F05 (saga worker stopped before the hold call; wallet restarts after committing the hold; worker stopped between HOLD_PLACED and the payout; worker killed after the rail answered; worker stopped in SETTLING or RELEASING; wallet stopped for minutes during any step; `transfers` stopped; RabbitMQ stopped; `audit` stopped; Redis stopped), start a batch of transfers, inject the fault while they are in flight, restore, wait for quiescence, and assert every transfer is COMPLETED or FAILED (NEEDS_REVIEW only where the matrix says so), exactly one hold per transfer, at most one payout at the rail, and the consistency sweep passes (AC-F05-39); the same run with two `transfers` replicas racing; RabbitMQ restarted during a burst loses no event and duplicates are absorbed (AC-F10-12); `audit` stopped during 50 actions then restarted shows all entries once and the completeness check reports zero difference (AC-F07-14, 15); poison and duplicate messages in the stack; confirm-to-COMPLETED timing p95 with the mock rail in normal mode and audit and event lag are measured and reported (NFR-PERF-5, NFR-CONS-2), not assumed.
- **Build:** the system test files, fault scripts using the T35 harness, a reduced matrix for CI and a full matrix for nightly (`pnpm test:system --full`); fix any defect found by adding a failing test first.
- **Done when:** `pnpm test:system` passes with the reduced matrix and the full matrix passes locally; the report lists each scenario with its result and the measured timings.
- **Verify:** `pnpm test:system`, `pnpm test:system --full`.
- **Evidence:**

**Review point D.** Present: the saga diagram with the result of each kill scenario, the sweep output, measured confirm-to-completed timing, and the list of everything that is still untested (the assistant, web and evaluation do not exist yet).

---

## Phase G: Assistant

### T37. Deterministic understanding helpers
- [ ] Done
- **Depends on:** T03
- **Covers:** FR-NLU-1, FR-NLU-3, FR-NLU-5, FR-NLU-6 (detection)
- **Spec:** F03 (languages, amount parser, date resolver)
- **Tests first:** AC-F03-1, 2, 3, 10 using the tables in F03 plus the extra cases; fuzz test that no parser throws on arbitrary strings; property test for amount formatting round trip; ambiguity returns all candidates.
- **Build:** `packages/assistant-core/nlu` modules: normalize, detect language, parse amounts, resolve dates (Asia/Kolkata, Monday weeks), abbreviation expansion, Hinglish word list.
- **Done when:** the criteria pass; modules are pure and take a `Clock`.
- **Verify:** `pnpm test:unit`.
- **Evidence:**

### T38. Recipient resolver
- [ ] Done
- **Depends on:** T37
- **Covers:** FR-NLU-8
- **Spec:** F03 recipient resolver
- **Tests first:** AC-F03-7 cases (Rohan, Devanagari alias, Rahul ambiguous, Rahull, Rohn too short, unknown); honorific stripping; tier ordering; the resolver only sees the beneficiary list handed to it, so it can never return data about other users.
- **Build:** pure resolver in `assistant-core` over the list returned by a `BeneficiaryDirectory` port, with an in-memory directory for tests (the `wallet`-backed adapter is built in T42).
- **Done when:** AC-F03-7 passes.
- **Verify:** `pnpm test:unit`.
- **Evidence:**

### T39. LLM gateway
- [ ] Done
- **Depends on:** T05, T06, T09
- **Covers:** NFR-REL-2, NFR-REL-7, NFR-COST-1, FR-NLU-4 (transport), supports FR-CONV-5
- **Spec:** ARCHITECTURE section 8; ADR-004, ADR-014
- **Tests first:** timeout at 15 s (fake timers), 2 retries with jitter on 429 and 5xx, no retry on 4xx, circuit opens after 5 consecutive failures for 30 s and closes after a success (state shared via the breaker store), concurrency limit (the 21st concurrent call waits at most 2 s for a slot and then fails with `overloaded`, slots are released on success, error and timeout, in-flight gauge), token caps passed through, every call is reported to an `LlmCallLog` port with masked prompt and response and an outcome, prompt redaction applied for untrusted providers, API keys never in logs, scripted fake LLM (queue of responses, delays, errors, captured requests).
- **Build:** `packages/llm`: `LlmClient` port, OpenAI-compatible adapter (works for Gemini's compatible endpoint, Ollama and others via base URL), the `CircuitBreaker` and `Bulkhead` from T09 (threshold 5, open 30 s, 20 in flight, 2 s wait), `LlmCallLog` port, scripted fake in `packages/llm/testing`.
- **Done when:** the listed behaviors pass; request capture is available for AC-F03-8 and AC-F06-4 and 7.
- **Verify:** `pnpm test:unit`, `pnpm test:int`.
- **Evidence:**

### T40. Interpreter
- [ ] Done
- **Depends on:** T37, T39
- **Covers:** FR-NLU-2, FR-NLU-3, FR-NLU-4, FR-NLU-5, FR-NLU-7, FR-SEC-2 (prompt side)
- **Spec:** F03 interpreter and cross-checks; ADR-004
- **Tests first:** AC-F03-4, 5, 6, 9; low confidence and multiple-intent handling; prompts contain only allowed context (AC-F03-8 via request capture); delimiters around user text; few-shot examples present per language.
- **Build:** prompt builder, structured-output call with Zod validation, one repair call, cross-check module, interpretation result type with `needs` and `reason`.
- **Done when:** the criteria pass using only the scripted LLM; no network used.
- **Verify:** `pnpm test:unit`.
- **Evidence:**

### T41. Policy engine and tool registry
- [ ] Done
- **Depends on:** T03, T04
- **Covers:** FR-SEC-1, FR-NLU-2 (closed intents), FR-CONV-7 (tool cap)
- **Spec:** F06 (policy engine, tool registry); ADR-003
- **Tests first:** AC-F06-1 (every row), AC-F06-2 (schema walk, no confirm tool, unknown tool, model-proposed confirm denied and a `policy.denied` event produced), AC-F05-15; tool cap of 4 per turn; Zod input validation with unknown fields rejected.
- **Build:** `assistant-core/policy` pure `decide`, `assistant-core/tools` registry with the seven tool definitions (handlers injected), role allowlists.
- **Done when:** the criteria pass with 90% branch coverage.
- **Verify:** `pnpm test:unit`, `pnpm test:security`.
- **Evidence:**

### T42. Assistant service: information tools, templates and navigation
- [ ] Done
- **Depends on:** T41, T38, T21, T22, T26, T08, T10, T11, T16
- **Covers:** FR-INFO-1, FR-INFO-2, FR-INFO-3, FR-NAV-1, FR-NLU-6 (reply locale), FR-XFER-9, NFR-REL-8 (assistant clients), FR-AUD-4 (producer side, `assistant`)
- **Spec:** F04 (balance, history, status, navigation, small talk); F02 (ports, dependency failure); INTERNAL_API; DATA_MODEL `assistant_db`
- **Tests first:** AC-F04-1, 3, 4, 5, 7, 10, 12, 13 with `wallet` and `transfers` replaced by contract fakes (balance and history tools, status wording for every status including CONFIRMED, HOLD_PLACED, SETTLING and RELEASING, navigation allowlist, dependency failure gives the templated reply and no fabricated numbers); AC-F02-17 (with `wallet` stopped the reply is the templated message plus the `menu` card and `assistant_dependency_failure_total{callee}` increments; after 5 failures the breaker opens and the next call fails fast); AC-F02-18 (the tools forward the caller's token; a proposal naming another user's object gets a 404 from the owning service and no data in the reply); AC-F03-11 (template completeness in en, hi and hi-Latn); Indian grouping formatter in every locale; the `WalletBeneficiaryDirectory` adapter returns only the caller's beneficiaries.
- **Build:** `apps/assistant` skeleton on the platform kit, `assistant_db` migrations (`conversations`, `messages`, `tool_invocations`, `llm_calls`, `support_tickets`, `kb_articles`, `eval_runs`, `eval_results`, `event_outbox`, `inbox`), `WalletClient` and `TransfersClient` (user token forwarded, 3 s timeout, one read retry, breaker per callee), `WalletBeneficiaryDirectory`, tool handlers, templates and catalogs (balance, history, status, navigation, small talk, capabilities, errors, dependency failure), card builders, `tool_invocations` and `llm_calls` writers, seed data.
- **Done when:** the listed criteria pass.
- **Verify:** `pnpm test:unit`, `pnpm test:int`, `pnpm test:contract`.
- **Evidence:**

### T43. Knowledge base, FAQ composer, output guard and tickets
- [ ] Done
- **Depends on:** T05, T39, T41, T42
- **Covers:** FR-SUP-1, FR-SUP-2, FR-SEC-4
- **Spec:** F04 (FAQ, tickets); F06 (output guard)
- **Tests first:** AC-F04-8, 9 (the ticket audit event is written in the same transaction); AC-F06-8; full-text search ranking with English and Hinglish keyword tags; composer output validation (ids subset, length); ticket masking and rate limit; support and admin ticket listing with ownership.
- **Build:** KB seed (12 to 15 curated articles in three locales), search repository in `assistant_db`, FAQ composer prompt and validator, output guard module in `assistant-core`, ticket service and endpoints.
- **Done when:** the criteria pass.
- **Verify:** `pnpm test:unit`, `pnpm test:int`, `pnpm test:security`.
- **Evidence:**

### T44. Turn pipeline orchestration
- [ ] Done
- **Depends on:** T09, T27, T40, T41, T42, T43
- **Covers:** FR-CONV-3, FR-CONV-4, FR-CONV-5, FR-CONV-7, FR-XFER-3 (typed channel), FR-XFER-9, NFR-PERF-2
- **Spec:** F02; F05 behavior 3 (typed); ARCHITECTURE section 5
- **Tests first:** AC-F02-4, 5, 6, 8, 10, 11, 12, 13; the `overloaded` fallback reason in the fallback decision table (AC-F02-14); AC-F05-14 (the lexicon matches exact phrases only, with zero LLM calls; "haan lekin 800 bhejo" is processed as a new request; a bare "haan" with nothing pending gets a clarifying template); typed confirm calls the internal `confirm-typed` route (fake `transfers`) and, when a PIN is required, the reply tells the user to use the button; typed cancel uses the public cancel route as the user; a failed prepare creates nothing and says so; fallback decision table; clarification counter; `PROVIDE_SLOT` continuation; per-turn tool cap; benchmark for turn overhead.
- **Build:** `assistant-core/pipeline` with ports, dialog state transitions, typed-confirm handler, fallback logic, responder, persistence of messages, tool invocations and `llm_calls` links, audit events (`assistant.action`, `policy.denied`, `output_guard.blocked`) through the outbox in the same transaction as the records they describe (AC-F02-11).
- **Done when:** the listed criteria pass with the scripted LLM through the pipeline function (HTTP comes next).
- **Verify:** `pnpm test:unit`, `pnpm test:int`.
- **Evidence:**

### T45. Conversation API and streaming
- [ ] Done
- **Depends on:** T44, T16, T34
- **Covers:** FR-CONV-1, FR-CONV-2, FR-CONV-6, FR-CONV-7, NFR-PERF-3 (first event)
- **Spec:** F02; API conversation routes and SSE
- **Tests first:** AC-F02-1, 2, 3, 7, 9, 14; SSE ordering test with a real HTTP client; the same test through a real `edge` instance in front of the assistant (no buffering; first event within 300 ms with the scripted model); JSON mode; abort mid-turn still persists; `client_message_id` replay makes zero LLM calls; ownership matrix entries (AC-F01-8 for `assistant`); AC-F02-19 (one trace across `edge`, `assistant` and the called service, `traceparent` stored on the outbox rows).
- **Build:** routes, SSE writer, request-scoped abort handling, `Accept` negotiation, route table entries in `edge`, assistant added to the compose stack.
- **Done when:** the criteria pass.
- **Verify:** `pnpm test:int`, `pnpm test:security`, `pnpm test:contract`, `pnpm test:system -- smoke`.
- **Evidence:**

### T46. Transfer outcome notices
- [ ] Done
- **Depends on:** T45, T30
- **Covers:** FR-XFER-14
- **Spec:** F02 (transfer notices); EVENTS (`transfer.status_changed`); F04 (status wording)
- **Tests first:** AC-F02-15 (a `completed`, `failed` or `needs_review` event with a valid origin conversation creates exactly one `system_notice` message with the golden text in en, hi and hi-Latn and zero LLM calls; the same event delivered five times creates no second notice; intermediate statuses create none), AC-F02-16 (unknown conversation, a user who does not own it, or an invalid payload creates no message; invalid payloads go to the DLQ); consumer contract test against the shared event schema and snapshot; a system test where a transfer prepared in chat completes and the notice appears in that conversation, and a failed transfer (`INSUFFICIENT_FUNDS`) produces the failure notice.
- **Build:** `TransferNoticeConsumer` on queue `assistant.transfer_notices` (bound to `completed`, `failed`, `needs_review`), notice templates, unique key per transfer and status in message metadata, `GET /v1/conversations/:id/messages` includes notices.
- **Done when:** AC-F02-15 and 16 pass and the system test shows the notice in the originating conversation (or is reported "not run" if Docker is unavailable).
- **Verify:** `pnpm test:int`, `pnpm test:system -- notices`.
- **Evidence:**

### T47. Injection and guardrail end-to-end tests
- [ ] Done
- **Depends on:** T46
- **Covers:** FR-SEC-2, FR-SEC-3, FR-SEC-4, NFR-SEC-1 (LLM-specific)
- **Spec:** F06 AC-F06-3, 4, 6, 7; TESTING evaluation and OWASP sections
- **Tests first:** the injection corpus (at least 30 payloads, en/hi/hi-Latn) as a data file run through the `assistant` HTTP API with a scripted model that obeys the injection (worst case) and fakes of `wallet` and `transfers` that record every call; assertions: no state change, no forbidden tool, no call to a confirm route, no canary and no foreign identifiers; seeded injection text in beneficiary names and notes never reaches any captured LLM request; log capture across the services involved proves no raw phone, email or PAN-like value anywhere; a reduced corpus subset is repeated through the full stack in compose.
- **Build:** corpus file, scripted "hijacked model" behaviors, log capture helpers; fix defects found by adding failing tests first.
- **Done when:** the whole corpus passes and `pnpm test:security` includes it.
- **Verify:** `pnpm test:security`.
- **Evidence:**

**Review point E.** Present: pipeline behaviors, injection results, the list of scripted-model-only claims (nothing about live-model quality yet), how the assistant degrades when `wallet` or `transfers` is down.

---

## Phase H: Web and admin

### T48. Web app shell and chat
- [ ] Done
- **Depends on:** T45, T35
- **Covers:** FR-UI-1 (chat), NFR-UX-1, NFR-UX-2
- **Spec:** F09 web client
- **Tests first:** component tests for cards and catalogs (text rendered as text, XSS strings literal); Playwright: login, send message, streamed reply, chips, language switch, keyboard-only flow, first feedback under 300 ms with the scripted model; axe checks on login and chat; the locale preference change triggers an immediate token refresh (AC-F01-17).
- **Build:** Vite React app, API client with SSE reader (talks only to `edge` through the proxy), TanStack Query, auth in memory, catalogs from `shared`, card components, accessible layout with live region; `web` added to the compose stack and served by the proxy.
- **Done when:** AC-F09-15 (login, balance, language switch parts), AC-F09-16 (login and chat pages) and AC-F09-17 pass.
- **Verify:** `pnpm test:e2e`.
- **Evidence:**

### T49. Transfer UX and fallback mode
- [ ] Done
- **Depends on:** T48, T27, T36, T46
- **Covers:** FR-UI-1 (confirmation, status), FR-UI-2, FR-INFO-4
- **Spec:** F09 web client; F04 status polling; F05
- **Tests first:** Playwright: transfer with confirm, with PIN, cancel, expiry countdown, double-click confirm sends one effective request, the confirmation card shows CONFIRMED and then updates to COMPLETED within 5 s by polling (asynchronous confirm), insufficient funds at the hold shows the failed status with its reason, the outcome notice appears in the chat, fallback mode with the LLM disabled **and with the `assistant` container stopped** (chips call the `wallet` and `transfers` APIs through `edge`, the prepare form works), XSS note shown literally.
- **Build:** confirmation card with PIN, status card with polling, fallback forms, error states with request id.
- **Done when:** AC-F04-6, AC-F09-15 and AC-F09-16 (confirmation card) pass.
- **Verify:** `pnpm test:e2e`.
- **Evidence:**

### T50. Admin API
- [ ] Done
- **Depends on:** T31, T18, T43, T45
- **Covers:** FR-ADM-1, FR-ADM-2, FR-AUD-1 (admin actions)
- **Spec:** API admin routes (owner column); F09 admin console; F07
- **Tests first:** AC-F09-1 (every admin route against every role, through `edge` and directly at `assistant`, `transfers` and `audit`), AC-F09-2 (masked transcripts by default; `admin.view_conversation` event; unmask requires reason and admin role and writes `admin.unmask` with the reason; support cannot unmask), AC-F09-7 (API part: eval runs, per-case results and comparison for two stored fixture runs); `POST /v1/admin/evals/runs` accepts a bounded run body from admins only and stores `eval_runs` and `eval_results`; LLM-call log filters; ticket listing and status changes (`PATCH /v1/admin/tickets/:id`); every admin read of other users' data is audited (`admin.view_conversation`, `admin.view_llm_calls`, `admin.view_tickets`, and in `transfers` `admin.view_transfer`); filters and pagination.
- **Build:** admin routes in `assistant` (conversations, transcripts, unmask, LLM calls, tickets, eval runs, compare and ingest), route table entries in `edge`, transcript assembler (interpretations and tool calls). Admin routes in `transfers` and `audit` already exist (T31, T18).
- **Done when:** the criteria pass and the role matrix test covers every admin route in all three services.
- **Verify:** `pnpm test:int`, `pnpm test:security`.
- **Evidence:**

### T51. Admin UI
- [ ] Done
- **Depends on:** T50, T49
- **Covers:** FR-ADM-1
- **Spec:** F09 admin console
- **Tests first:** Playwright as admin: conversation inspector (masked, then unmask with reason), transfer monitor with reconcile and resolve (AC-F09-3), audit page with chain status, lag, verify and tamper detection (AC-F09-4), LLM calls, tickets; support role sees only conversations and tickets; axe checks on admin pages.
- **Build:** admin pages and navigation guarded by role (server enforcement remains primary).
- **Done when:** AC-F09-3, 4, 16 (admin pages) pass.
- **Verify:** `pnpm test:e2e`.
- **Evidence:**

**Review point F.** Present: screenshots from Playwright runs (stored as artifacts), a11y results, the fallback demonstration with the assistant stopped.

---

## Phase I: Evaluation

### T52. Dataset, validator and metrics
- [ ] Done
- **Depends on:** T40
- **Covers:** FR-EVAL-1, FR-EVAL-2 (metric code)
- **Spec:** F08
- **Tests first:** AC-F08-1, 2, 4 (validator mutation tests, composition minimums, metric math against hand-computed fixtures including Wilson interval and percentiles).
- **Build:** author the 240-plus case dataset (realistic phrasing, balanced as F08 specifies, manifest with version and authorship note), validator CLI, metrics library.
- **Done when:** the dataset check passes; the report states the case counts per group.
- **Verify:** `pnpm test:unit`, `pnpm eval:check`.
- **Evidence:**

### T53. NLU evaluator, reports and comparison
- [ ] Done
- **Depends on:** T52, T39, T50
- **Covers:** FR-EVAL-2, FR-EVAL-4, NFR-AI-1
- **Spec:** F08 NLU evaluator and model comparison
- **Tests first:** AC-F08-3, 5, 8, 9, 10 using the scripted model (expected and perturbed); the evaluator runs in process and needs no service or database; incomplete run exits non-zero; provider outage counted as errors; posting a run to `POST /v1/admin/evals/runs` stores it (against a running stack or a test instance of `assistant`); comparison output on two stored fixtures; README results script refuses hand-typed numbers.
- **Build:** `pnpm eval:nlu`, `pnpm eval:compare`, the run poster, Markdown report generator. Each run also writes its JSON and Markdown report to `docs/eval-results/`, which is committed, because the database is local to each machine: live Qwen3 runs happen on the owner's desktop PC (RTX 5060, 8 GB, Ollama), and the committed reports are how those results reach the laptop and the README. Include a short `docs/LOCAL_MODEL.md` with the PC setup steps (install Ollama, pull `qwen3:4b` and `qwen3:8b`, set the model environment variables, run the evaluation), written from what was actually done.
- **Done when:** scripted-model runs complete and store results, and the report shows per-language metrics and the amount cross-check mismatch rate (AC-F03-12). Live Gemini and Ollama runs are separate manual steps for the owner: document the commands; do not report live results unless they were actually run.
- **Verify:** `pnpm eval:nlu --provider scripted`.
- **Evidence:**

### T54. Workflow evaluator and CI gates
- [ ] Done
- **Depends on:** T47, T49, T53, T36
- **Covers:** FR-EVAL-3, FR-EVAL-5
- **Spec:** F08 workflow evaluator, CI gates
- **Tests first:** AC-F08-6 and 7 (a deliberately broken fixture makes the evaluator fail on an unsafe action, a duplicate execution or a failing consistency sweep); 25-plus scenarios listed in F08, including insufficient funds at the hold, the transfer outcome notice and `wallet` unavailable.
- **Build:** scenario DSL and runner against the compose stack through `edge` (using `pnpm stack:reset` between scenarios), report writer, CI job `eval-gate` (no network, no keys).
- **Done when:** `pnpm eval:workflow` passes all scenarios with zero unsafe actions, zero duplicate executions and a clean sweep; the CI job is defined (green status only after a real run).
- **Verify:** `pnpm eval:workflow`.
- **Evidence:**

**Review point G.** Present: eval report (scripted), explicit list of what remains manual.

---

## Phase J: Operations and ship

### T55. Telemetry across services, dashboards and alerts
- [ ] Done
- **Depends on:** T46, T36, T51
- **Covers:** FR-OBS-1, FR-OBS-2, FR-OBS-3 (log checks), FR-OPS-2, NFR-OBS-1, NFR-OBS-2, NFR-OBS-3, NFR-CONS-2 (alerts)
- **Spec:** F09 observability; ARCHITECTURE section 11; F10 (trace propagation)
- **Tests first:** AC-F09-5 (log capture from all services during a full e2e run: `service` and request id on every line, the same request id across the services that handled one request, no raw message text, phone, email, PIN or token), AC-F09-6 (every listed metric appears in its owning service with bounded labels; a test fails if a label derives from user input), AC-F09-8 (one trace for a chat turn that prepares and confirms a transfer contains spans from `edge`, `assistant`, `transfers` and `wallet` for HTTP, pipeline, LLM, tool, service call, saga step, outbox publish, database and rail, the audit consumer continues the same trace, and the error response carries the trace id), AC-F09-9 (alert rule lint; every metric referenced exists in the code's registry; the rules are exactly the list in ARCHITECTURE section 11: saga stuck, NEEDS_REVIEW, DLQ above 0, audit and outbox lag, service and rail breaker open, watchdog requeues, `saga_defect_total`); metric registry test (every metric named in specs exists, labels are bounded enums).
- **Build:** metric registrations per service, OpenTelemetry setup in the kit with the redacting span processor, instrumentation for service calls, saga steps, outbox relay and consumers, Grafana provisioning (five dashboards: service health, assistant quality, transfer funnel and saga, messaging, platform), Prometheus rules, Jaeger in the `observability` compose profile.
- **Done when:** the automated criteria pass; AC-F09-10 is verified manually if Docker is available and recorded as manual.
- **Verify:** `pnpm test:int`, `pnpm test:system -- trace`; `docker compose --profile observability config`.
- **Evidence:**

### T56. Load, scale and security suites, performance report
- [ ] Done
- **Depends on:** T55, T47, T36
- **Covers:** NFR-PERF-1, NFR-PERF-3, NFR-PERF-4, NFR-PERF-5, NFR-SCAL-1, NFR-SCAL-3, NFR-SEC-1, NFR-MAINT-2, NFR-MAINT-3, NFR-ARCH-2 (completeness)
- **Spec:** TESTING sections 4, 5, 7, 8; F09 AC-F09-14; F10 AC-F10-6 to 8
- **Tests first:** k6 scripts for read endpoints, confirm and a mixed workload with thresholds from the PRD; replica scale test (3 `edge`, 2 each of `assistant`, `wallet` and `transfers` behind the proxy, no sticky sessions, a mixed workload including transfers, no errors and no duplicate saga effects; AC-F09-14); the OWASP mapping test file lists every applicable item and fails if any has no test (AC-F06-13); coverage gate for the 90% modules; OpenAPI and event-schema contract tests complete for every route and event (AC-F10-6 to 8).
- **Build:** `pnpm loadtest`, compose override for replicas, `docs/PERFORMANCE.md` generated from actual runs with machine details; no number is written unless measured.
- **Done when:** AC-F05-28 and AC-F09-14 are measured, the suites for AC-F06-13 run, and thresholds are reported as met or not met honestly. If k6 or Docker is unavailable the report says "not run".
- **Verify:** `pnpm test:security`, `pnpm loadtest`, `pnpm test:contract`.
- **Evidence:**

### T57. Documentation, ADRs, staging attempt and release check
- [ ] Done
- **Depends on:** T54, T56
- **Covers:** FR-OPS-1, FR-OPS-4, NFR-MAINT-4, NFR-OPS-1, NFR-SCAL-4, NFR-SEC-4 (container), NFR-COST-1
- **Spec:** all ADRs; README; F09 runtime
- **Tests first:** a fresh-clone script (clone to a temp directory, follow the README commands, reach a healthy stack and a successful demo login and transfer) run in CI where Docker exists; a link checker for docs; a script that checks the README results table against stored eval runs (AC-F08-9); container user check (non-root) for every image.
- **Build:** `docs/DEMO.md`: a short project pitch, a 10-minute demo script covering the main flows, one failure demonstration using the rail fault modes, and one resilience demonstration (stop `wallet` or `transfers` mid-transfer and show the system recover, with the RabbitMQ management UI and the traces visible), an architecture overview with a diagram, and the honest list of limits. Before the repository goes public: update the status lines in `specs/README.md` so they describe what is actually built and add a README note that the project was built with AI assistance (Claude Code) using spec-driven development. Then README (quick start in under 15 minutes, architecture overview, demo script with a Hinglish transfer, results section from real runs only), finalize ADR statuses, `docs/SCALING.md` (documented paths: read replicas, ledger and audit partitioning, Kafka in place of RabbitMQ, a workflow engine such as Temporal in place of the hand-built saga, service mesh with mutual TLS, separate LLM serving; and what was deliberately not built and why), `docs/SECURITY.md` (threat model summary and honest limits), `docs/STAGING.md` after a real free-tier attempt (or an honest statement that it was not attempted), final `pnpm verify`.
- **Done when:** a clean clone reaches a working demo following the README (AC-F09-11, with the memory budget measured by `docker stats` or reported as not run); AC-F09-19 and AC-F09-20 hold; `pnpm verify` result is recorded exactly; open issues are listed.
- **Verify:** `pnpm verify`, fresh-clone script.
- **Evidence:**

**Review point H (final).** Present: what is verified (with command output), what is not, how to run the live evals, the staging outcome.

---

## Out of scope for this plan

Real payment rails, real KYC, native mobile apps, voice, multi-currency, push notifications, fine-tuning a model, FR-XFER-11 (signed webhook, Could), the trusted-provider redaction bypass (Could), a service mesh or mutual TLS between services, Kafka, a workflow engine, per-service Kubernetes manifests and distributed locks. They are listed as documented scaling paths or future work in the README.

## Requirement coverage rule

Every Must and Should requirement in `PRD.md` appears in at least one task's **Covers** line, and every task's **Covers** ids exist in the PRD. A script (`pnpm spec:check`, created in T01 as a placeholder and completed in T57) must verify this and fail on gaps. Could items are exempt.
