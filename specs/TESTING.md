# Testing Strategy

Status: DRAFT for approval. Implements the TDD rules in `CLAUDE.md`. Tests are derived from the acceptance criteria in `specs/features/` and the NFRs in `PRD.md`.

## 1. Principles

- **Red before green.** Write the test from an acceptance criterion, run it, and confirm it fails for the intended reason (an assertion about behavior), not because of a missing import, bad setup or broken infrastructure. Record the failing output in the task report.
- **Real dependencies where it matters.** Money, concurrency, idempotency and authorization bugs only show up against a real Postgres and Redis. Integration tests never mock the database or Redis.
- **Mock only at the model boundary.** The LLM is replaced by a scripted fake (deterministic outputs keyed by utterance). The payment rail is the real `mock-rail` service, with fault injection.
- **Never weaken a test to make code pass.** If a test is wrong, change the spec first, then the test, and say so in the report.
- **No test claims without execution.** A check counts as passed only when the command ran and the output was seen.

## 2. Layers

| Layer | Tooling | Scope | Runs |
|---|---|---|---|
| Static | ESLint, Prettier, `tsc --noEmit`, dependency-cruiser, gitleaks, dependency audit | Style, types, module boundaries, secrets, vulnerable packages | Every commit, CI |
| Unit | Vitest | Pure logic in `packages/core`: money, number and date parsers, state machine, policy table, templates, redaction, recipient matching, interpreter validation and repair | Every commit, CI |
| Property-based | fast-check inside Vitest | Money arithmetic, ledger invariants, parser round-trips, state-machine legality, redaction never leaks | CI |
| Integration | Vitest, real Postgres 16 and Redis 7, `fastify.inject` and real HTTP for rail | HTTP routes, auth, authorization, repositories, idempotency, outbox worker, rail adapter against `mock-rail`, rate limits, audit chain, SSE | CI |
| Contract | Vitest | OpenAPI generated from Zod matches registered routes; the rail adapter passes the same contract suite against `mock-rail`; SSE event shapes | CI |
| Reliability | Vitest with real services and fault injection | Concurrency, crashes, timeouts, lost and duplicate responses, Redis and LLM outages | CI (reduced), nightly (full) |
| Security | Vitest | Authorization matrix, OWASP API mapping, injection corpus, output guard | CI |
| End-to-end | Playwright with scripted model | Critical journeys through the real UI, API, worker, rail; accessibility checks with axe | CI |
| Evaluation | `packages/evals` CLI | NLU quality per language and model; workflow completion and safety | Harness in CI with scripted model; live models manual |
| Load | k6 | Latency and throughput with the LLM stubbed; 3-replica scale test | Manual and nightly, results recorded in README |

## 3. Test data and isolation

- Each integration test file gets its own database cloned from a migrated template database (`CREATE DATABASE ... TEMPLATE`), and its own Redis logical database or key prefix. Tests that need real commits (concurrency) are therefore safe to run in parallel.
- Fixtures come from the seed module, not hand-built SQL scattered across tests. Time is controlled through a `Clock` port; tests never sleep for real expiry.
- Scripted LLM: a map from normalized utterance to interpretation JSON, plus helpers to script invalid JSON, timeouts and errors.
- Hindi and Hinglish fixtures are stored as UTF-8 files and validated by a test that rejects mojibake and unnormalized Unicode.

## 4. Required test families

1. **Authorization matrix.** For every route and every role (anonymous, customer, other customer, support, admin) assert the expected status. A test fails if a route is registered without a declared policy.
2. **Idempotency.** Same key and payload replays; same key, different payload is rejected; 100 parallel identical confirms execute once; a wrong PIN does not consume the key; replay after the original completed returns the stored body with the replay header.
3. **Ledger invariants.** After every reliability scenario, assert the invariants in ARCHITECTURE section 6 and that `available` and `held` are non-negative.
4. **Transfer state machine.** Only legal transitions succeed; every transition writes an event and an audit entry; terminal states are final.
5. **Failure injection.** Rail `timeout`, `lost_response`, `duplicate_response`, `error_5xx`, `reject`; worker killed after the rail call and before the database update; two workers racing for one outbox row; Postgres connection lost during confirm (no partial state).
6. **Prompt injection corpus.** At least 30 payloads (direct instructions, role play, fake "system" messages, injected text in beneficiary names and notes, Hindi and Hinglish variants). Assert: no state change, no tool outside the allowlist, no leaked system prompt or other users' data, and the event is recorded.
7. **Redaction.** Phone, email, account number, PAN-like, Aadhaar-like and card patterns are masked in logs, traces, `llm_calls`, tickets and admin views; property test that masked output never contains the original.
8. **Language handling.** Number-word parser table tests (en, hi, hi-Latn), Indian digit grouping, dates relative to a fixed clock in `Asia/Kolkata`, script and language detection, mixed-language inputs.
9. **Fallback.** LLM timeout, invalid JSON twice, circuit open: the reply is the menu card and the wallet APIs still work.
10. **Audit chain.** Sequential and concurrent inserts keep a valid chain; editing any stored row makes verification report the first bad id; the app role cannot update or delete audit rows.
11. **SSE.** Event order, error mid-stream, client disconnect, duplicate `client_message_id`.
12. **Graceful shutdown and readiness.** In-flight request completes; readiness flips when Postgres is down.

## 5. OWASP API Security Top 10 (2023) mapping (NFR-SEC-1)

| Item | Test |
|---|---|
| API1 Broken object level authorization | Customer A requests B's wallet data, transfer, conversation, ticket: 404 for each |
| API2 Broken authentication | Login throttling and lockout, expired and tampered tokens, refresh reuse revokes family |
| API3 Broken object property level authorization | Response schemas are allowlists (no `password_hash`, `rail_token`, `pin_hash`); unknown request properties rejected |
| API4 Unrestricted resource consumption | Rate limits, body and message size limits, token caps, 4-tool limit per turn |
| API5 Broken function level authorization | Admin and support routes against every role |
| API6 Unrestricted access to sensitive business flows | Transfer limits, PIN lockout, ticket rate limit, idempotency |
| API7 Server-side request forgery | No tool or endpoint accepts a URL; outbound calls only to configured base URLs |
| API8 Security misconfiguration | CORS allowlist, headers, no stack traces in errors, debug off in production config |
| API9 Improper inventory management | Contract test: no undeclared routes; OpenAPI served and in sync |
| API10 Unsafe consumption of APIs | LLM and rail responses validated against schemas; malformed responses handled |

## 6. Evaluation testing (F08)

- Dataset validator test: schema, language and category counts meet FR-EVAL-1, no duplicate utterances, every label uses the closed intent set.
- Harness test: with a scripted model that returns the gold labels, the NLU eval reports 100% and the workflow eval passes all scenarios. This proves the harness, not the model.
- Workflow gate in CI: all scenarios pass with the scripted model; unsafe actions = 0; duplicates = 0.
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
| `pnpm test:int` | Integration tests (needs Postgres and Redis; `pnpm infra:test:up` starts them) |
| `pnpm test:contract` | OpenAPI and rail contract tests |
| `pnpm test:reliability` | Concurrency and fault-injection suite |
| `pnpm test:security` | Authorization matrix, OWASP mapping, injection corpus |
| `pnpm test:e2e` | Playwright journeys against the compose stack |
| `pnpm eval:nlu --provider <name>` | NLU evaluation, writes JSON and Markdown report and DB rows |
| `pnpm eval:workflow` | Workflow evaluation (scripted model by default, `--live` for a real model) |
| `pnpm eval:check` | Validate the evaluation dataset (schema, ids, composition minimums) |
| `pnpm eval:compare <runA> <runB>` | Side-by-side comparison table of two stored evaluation runs |
| `pnpm spec:check` | Requirement traceability: every Must and Should id in the PRD appears in a task's Covers line, and every Covers id exists |
| `pnpm db:migrate` | Apply database migrations with the migrator role (also `pnpm db:seed`) |
| `pnpm loadtest` | k6 read-path and confirm-path tests |
| `pnpm build` | Build all workspaces and container images |
| `pnpm verify` | lint, typecheck, arch, spec:check, eval:check, unit, integration, contract, reliability, security, scripted eval gates, build |
| `docker compose up` | Run the full stack |

## 9. CI pipeline (GitHub Actions)

1. Install with a frozen lockfile and cache.
2. Static checks: lint, typecheck, arch, gitleaks, dependency audit.
3. Unit and property tests with coverage.
4. Integration, contract, reliability (reduced) and security tests with Postgres and Redis service containers.
5. Build images; start compose; run Playwright and the workflow eval gate.
6. Publish test reports and coverage as artifacts.

## 10. What CI cannot verify

Live hosted-model behavior, self-hosted Qwen3 results (GPU), free-tier staging, and real-world Hindi quality beyond the labeled dataset. These are reported honestly in the README with dates and conditions.

## 11. Traceability

| Requirement area | Primary test layers |
|---|---|
| FR-AUTH | Integration, security, unit |
| FR-CONV, FR-NLU | Unit, integration, evaluation, e2e |
| FR-INFO, FR-NAV, FR-SUP | Integration, e2e |
| FR-XFER | Unit (state machine), property (ledger), integration, reliability, e2e |
| FR-SEC, FR-AUD | Security, unit, property, integration |
| FR-EVAL | Harness tests, dataset validation |
| FR-ADM, FR-UI | e2e with accessibility checks, integration |
| FR-OBS, FR-OPS | Integration (metrics endpoint, ids), smoke, CI itself |
| NFR-PERF, NFR-SCAL | k6, tracing benchmarks |
| NFR-REL | Reliability suite |
| NFR-SEC, NFR-PRIV | Security suite, redaction tests, CI scans |
| NFR-AI | Evaluation runs |
