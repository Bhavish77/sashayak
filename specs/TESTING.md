# Testing Strategy

Status: DRAFT for approval. Implements the TDD rules in `CLAUDE.md`. Tests are derived from the acceptance criteria in `specs/features/` and the NFRs in `PRD.md`.

## 1. Principles

- **Red before green.** Write the test from an acceptance criterion, run it, and confirm it fails for the intended reason (an assertion about behavior), not because of a missing import, bad setup or broken infrastructure. Record the failing output in the task report.
- **Real dependencies where it matters.** Money, concurrency, idempotency, messaging and authorization bugs only show up against a real Postgres, Redis and RabbitMQ. Integration tests never mock the database, Redis or the broker.
- **Each service is tested alone, then together.** A service's unit, integration and contract tests use only its own database and **contract fakes** of its collaborators (generated from the shared schemas). Whether the services really fit is proved by the system suite on the compose stack. Neither replaces the other.
- **Mock only at the model boundary and at service boundaries inside a service's own suite.** The LLM is replaced by a scripted fake (deterministic outputs keyed by utterance). The payment rail is the real `mock-rail` service, with fault injection. Other services appear as contract fakes in a service's own suite and as real containers in the system suite.
- **Never weaken a test to make code pass.** If a test is wrong, change the spec first, then the test, and say so in the report.
- **No test claims without execution.** A check counts as passed only when the command ran and the output was seen.

## 2. Layers

| Layer | Tooling | Scope | Runs |
|---|---|---|---|
| Static | ESLint, Prettier, `tsc --noEmit`, dependency-cruiser, gitleaks, dependency audit | Style, types, module boundaries, secrets, vulnerable packages | Every commit, CI |
| Unit | Vitest | Pure logic in `packages/shared`, `packages/platform`, `packages/assistant-core` and each service's `domain`: money, number and date parsers, transfer and hold state machines, policy table, templates, redaction, recipient matching, interpreter validation and repair, breaker, bulkhead, backoff | Every commit, CI |
| Property-based | fast-check inside Vitest | Money arithmetic, ledger invariants, parser round-trips, state-machine legality, redaction never leaks | CI |
| Integration (per service) | Vitest, real Postgres 16, Redis 7 and RabbitMQ 3, `fastify.inject`, real HTTP for the rail, contract fakes for other services | One service at a time: routes, auth, authorization, repositories, idempotency, saga queue, outbox relay, inbox consumers, rail adapter against `mock-rail`, rate limits, audit chain, SSE | CI |
| Contract | Vitest | Provider tests (each service's real responses, internal responses and published events validate against the shared Zod schemas); consumer tests (each caller works against fakes built from the same schemas); OpenAPI generated per service matches registered routes; event schema snapshots catch breaking changes; the rail adapter passes the same suite against `mock-rail`; SSE event shapes | CI |
| Reliability (per service) | Vitest with real dependencies and fault injection | Concurrency, crashes, timeouts, lost and duplicate responses, Redis, broker and LLM outages, one service at a time | CI (reduced), nightly (full) |
| System | Vitest driving the compose stack (`pnpm test:system`), containers stopped, killed and paused through the Docker API | The saga across real services: kill each service and the broker at every saga step, duplicate and poison messages, DLQ behavior, replicas racing, then the consistency sweep; end-to-end completeness of audit events; database-credential isolation; `/internal` unreachable through the proxy | CI (reduced matrix), nightly (full matrix) |
| Security | Vitest | Authorization matrix per service, internal-route protection and service-token matrix, key separation, step-up assertions, OWASP API mapping, injection corpus, output guard | CI |
| End-to-end | Playwright with scripted model | Critical journeys through the real UI and the whole stack; accessibility checks with axe | CI |
| Evaluation | `packages/evals` CLI | NLU quality per language and model; workflow completion and safety | Harness in CI with scripted model; live models manual |
| Load | k6 | Latency and throughput with the LLM stubbed; replica scale test; confirm-to-completed latency | Manual and nightly, results recorded in README |

## 3. Test data and isolation

- Each integration test file gets its own database cloned from the service's migrated template database (`CREATE DATABASE ... TEMPLATE`), its own Redis key prefix and its own RabbitMQ virtual host or queue-name prefix. Tests that need real commits (concurrency) are therefore safe to run in parallel.
- System tests own the compose stack for the duration of a run: `pnpm stack:reset` restores seed data in all five databases, clears Redis and purges queues between scenarios, and refuses to run outside a local or test environment.
- Fixtures come from each service's seed module (cross-service ids are fixed constants shared through `packages/shared`, checked by `pnpm seed:check`), not hand-built SQL scattered across tests. Time is controlled through a `Clock` port; tests never sleep for real expiry.
- Scripted LLM: a map from normalized utterance to interpretation JSON, plus helpers to script invalid JSON, timeouts and errors.
- Hindi and Hinglish fixtures are stored as UTF-8 files and validated by a test that rejects mojibake and unnormalized Unicode.

## 4. Required test families

1. **Authorization matrix.** For every route of every service and every role (anonymous, customer, other customer, support, admin) assert the expected status, **directly against the owning service** as well as through `edge`. A test fails if a route is registered without a declared policy or an internal route without an access-matrix entry.
2. **Idempotency.** Same key and payload replays; same key, different payload is rejected; 100 parallel identical confirms execute once; a wrong PIN does not consume the key; replay after the original completed returns the stored body with the replay header; every saga command (wallet hold, settle, release; rail payout) is idempotent per transfer id.
3. **Ledger invariants.** After every reliability and system scenario, assert the invariants in ARCHITECTURE section 6.1 and that `available` and `held` are non-negative; the consistency sweep (ARCHITECTURE section 6.4) also checks the invariants that span `wallet` and `transfers`.
4. **Transfer and hold state machines.** Only legal transitions succeed; every transfer transition writes an event, a status event and an audit event in the same transaction; terminal states are final; hold states follow the table in ARCHITECTURE section 6.1.
5. **Failure injection.** Rail `timeout`, `lost_response`, `duplicate_response`, `error_5xx`, `reject`; worker killed after the rail call and before the database update; two workers racing for one saga command or outbox row; Postgres connection lost during confirm (no partial state).
6. **Prompt injection corpus.** At least 30 payloads (direct instructions, role play, fake "system" messages, injected text in beneficiary names and notes, Hindi and Hinglish variants). Assert: no state change, no tool outside the allowlist, no leaked system prompt or other users' data, and the event is recorded.
7. **Redaction.** Phone, email, account number, PAN-like, Aadhaar-like and card patterns are masked in logs, traces, `llm_calls`, tickets and admin views; property test that masked output never contains the original.
8. **Language handling.** Number-word parser table tests (en, hi, hi-Latn), Indian digit grouping, dates relative to a fixed clock in `Asia/Kolkata`, script and language detection, mixed-language inputs.
9. **Fallback.** LLM timeout, invalid JSON twice, circuit open: the reply is the menu card and the wallet APIs still work.
10. **Audit chain.** Sequential and concurrent inserts keep a valid chain; editing any stored row makes verification report the first bad id; the app role cannot update or delete audit rows.
11. **SSE.** Event order, error mid-stream, client disconnect, duplicate `client_message_id`.
12. **Graceful shutdown and readiness.** In-flight request completes; readiness flips when Postgres is down.
13. **Resilience.** Rail circuit breaker (opens after 5 consecutive failures, half-open probe, closes, queue drains with each transfer completing once, no retry attempts consumed while open) and the LLM concurrency limit (saturation sheds to the fallback menu with reason `overloaded` while wallet and transfer endpoints keep their latency).
14. **Saga kill matrix (system).** For every row of the failure matrix in F05, stop, kill or pause the named container (`transfers` workers, `wallet`, `transfers` api, `audit`, `rabbitmq`, `redis`) while transfers are in flight, bring it back, and assert: every transfer ends COMPLETED or FAILED (NEEDS_REVIEW only where specified), exactly one hold, at most one payout at the rail, consistency sweep clean. Repeat with two replicas racing.
15. **Messaging.** Outbox atomicity, relay confirms, broker restart without loss, duplicate delivery, out-of-order delivery, poison message to the DLQ with alert, consumer crash before acknowledgement, retry queues with delays (fake clock for the delay logic).
16. **Contracts.** Provider test, consumer test and OpenAPI drift test for every public route, internal route and event; schema snapshot test for events; a mutated schema fails both sides.
17. **Isolation and internal protection.** Each service's application credentials are rejected by every other service's database; `/internal/*` through the proxy returns 404; missing, expired, forged, wrong-audience and replayed service tokens return 401; a valid token outside the caller's matrix row returns 403; the user-token and step-up private keys exist only in `edge`.
18. **Distributed tracing and logs.** One trace and one request id across `edge`, `assistant`, `transfers`, `wallet`, the outbox relay and the audit consumer; no sensitive values in any service's logs.

## 5. OWASP API Security Top 10 (2023) mapping (NFR-SEC-1)

| Item | Test |
|---|---|
| API1 Broken object level authorization | Customer A requests B's wallet data, transfer, conversation, ticket: 404 for each, against the owning service directly and through `edge` |
| API2 Broken authentication | Login throttling and lockout, expired and tampered tokens, refresh reuse revokes family |
| API3 Broken object property level authorization | Response schemas are allowlists (no `password_hash`, `rail_token`, `pin_hash`); unknown request properties rejected |
| API4 Unrestricted resource consumption | Rate limits, body and message size limits, token caps, 4-tool limit per turn |
| API5 Broken function level authorization | Admin and support routes against every role; internal routes against every caller in the access matrix |
| API6 Unrestricted access to sensitive business flows | Transfer limits, PIN lockout, ticket rate limit, idempotency |
| API7 Server-side request forgery | No tool or endpoint accepts a URL; outbound calls only to configured base URLs |
| API8 Security misconfiguration | CORS allowlist, headers, no stack traces in errors, debug off in production config |
| API9 Improper inventory management | Contract test: no undeclared routes in any service; OpenAPI per service in sync; every `/internal` route has a matrix entry |
| API10 Unsafe consumption of APIs | LLM, rail, wallet, transfers and event payloads validated against schemas; malformed responses handled |

## 6. Evaluation testing (F08)

- Dataset validator test: schema, language and category counts meet FR-EVAL-1, no duplicate utterances, every label uses the closed intent set.
- Harness test: with a scripted model that returns the gold labels, the NLU eval reports 100% and the workflow eval passes all scenarios. This proves the harness, not the model.
- Workflow gate in CI: all scenarios pass against the compose stack through `edge` with the scripted model; unsafe actions = 0; duplicates = 0; consistency sweep clean.
- Live-model runs (`pnpm eval:nlu --provider gemini`, `--provider ollama --model qwen3:4b` or `qwen3:8b`) are manual because they need keys or a GPU. Results are stored, shown in the admin console, and summarized in the README with the date, model, dataset version and git SHA.

## 7. Coverage expectations

- Money, idempotency, policy, ledger and audit modules: at least 90% branch coverage, enforced in CI (NFR-MAINT-2).
- Everything else: reported, not gated. Behavior and risk matter more than a percentage.
- Optional (Could): mutation testing with Stryker on money and policy modules.

## 8. Verification commands

Defined as root scripts in `package.json`; `pnpm verify` runs the CI-equivalent set.

| Command | Purpose |
|---|---|
| `pnpm lint` | ESLint and Prettier check |
| `pnpm typecheck` | `tsc --noEmit` across workspaces |
| `pnpm arch` | dependency-cruiser boundary and cycle check |
| `pnpm test:unit` | Unit and property tests |
| `pnpm test:int` | Per-service integration tests (needs Postgres, Redis and RabbitMQ; `pnpm infra:test:up` starts them) |
| `pnpm test:contract` | Provider and consumer contract tests, OpenAPI drift, event schema snapshots, rail contract |
| `pnpm test:reliability` | Per-service concurrency and fault-injection suite |
| `pnpm test:system [-- <group>]` | Cross-service suite on the compose stack: saga kill matrix, messaging faults, isolation, internal protection, completeness (needs Docker; groups `smoke`, `saga`, `notices`, `trace`, `isolation`; `--full` for the nightly matrix) |
| `pnpm test:security` | Authorization matrices, internal protection, key separation, OWASP mapping, injection corpus |
| `pnpm test:e2e` | Playwright journeys against the compose stack |
| `pnpm eval:nlu --provider <name>` | NLU evaluation (`scripted`, `gemini`, `ollama`), writes JSON and Markdown report; posts the run to the admin API when a stack is running |
| `pnpm eval:workflow` | Workflow evaluation (scripted model by default, `--live` for a real model) |
| `pnpm eval:check` | Validate the evaluation dataset (schema, ids, composition minimums) |
| `pnpm eval:compare <runA> <runB>` | Side-by-side comparison table of two stored evaluation runs |
| `pnpm spec:check` | Requirement traceability: every Must and Should id in the PRD appears in a task's Covers line, and every Covers id exists |
| `pnpm db:migrate` | Apply every service's migrations with its migrator role (also `pnpm db:seed`, `pnpm seed:check` to verify cross-service ids line up) |
| `pnpm keys:generate` | Write development Ed25519 keys for user tokens, step-up assertions and service tokens to an ignored file |
| `pnpm sweep:consistency` | Run the cross-service invariant checks (ARCHITECTURE section 6.4) and the audit completeness check against a running stack, using the test-only sweep role |
| `pnpm stack:reset` | Restore seed data in all five databases, clear Redis and purge queues (local and test environments only) |
| `pnpm loadtest` | k6 read-path and confirm-path tests |
| `pnpm build` | Build all workspaces and container images |
| `pnpm verify` | lint, typecheck, arch, spec:check, eval:check, unit, integration, contract, reliability, security, system (reduced matrix, when Docker is available), scripted eval gates, build |
| `docker compose up` | Run the full stack |

## 9. CI pipeline (GitHub Actions)

1. Install with a frozen lockfile and cache.
2. Static checks: lint, typecheck, arch, gitleaks, dependency audit.
3. Unit and property tests with coverage.
4. Per-service integration, contract, reliability (reduced) and security tests with Postgres, Redis and RabbitMQ service containers, one job per service in parallel.
5. Build images; start compose; run the system suite (reduced kill matrix, isolation, internal protection, sweep), Playwright and the workflow eval gate.
6. Nightly: full kill matrix with replicas racing, load test, full reliability suite.
7. Publish test reports and coverage as artifacts.

## 10. What CI cannot verify

Live hosted-model behavior, self-hosted Qwen3 results (GPU), free-tier staging, and real-world Hindi quality beyond the labeled dataset. These are reported honestly in the README with dates and conditions.

## 11. Traceability

| Requirement area | Primary test layers |
|---|---|
| FR-AUTH | Integration (per service), security, unit |
| FR-CONV, FR-NLU | Unit, integration, evaluation, e2e |
| FR-INFO, FR-NAV, FR-SUP | Integration, e2e |
| FR-XFER | Unit (state machines), property (ledger, hold, saga convergence), integration, reliability, system (kill matrix), e2e |
| FR-SEC, FR-AUD | Security, unit, property, integration, system (audit completeness) |
| FR-SVC, NFR-ARCH, NFR-CONS | Contract, security, messaging integration, system |
| FR-EVAL | Harness tests, dataset validation |
| FR-ADM, FR-UI | e2e with accessibility checks, integration |
| FR-OBS, FR-OPS | Integration (metrics endpoint, ids), smoke, CI itself |
| NFR-PERF, NFR-SCAL | k6, tracing benchmarks, system timing |
| NFR-REL | Reliability and system suites |
| NFR-SEC, NFR-PRIV | Security suite, redaction tests, CI scans |
| NFR-AI | Evaluation runs |
