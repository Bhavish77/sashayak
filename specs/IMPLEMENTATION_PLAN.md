# Implementation plan

Status: draft for approval. Nothing below has been built or run yet; every checkbox is unchecked on purpose.

This plan turns the specs into 44 small tasks that Claude Code (or any developer) can execute in order. Each task is a vertical, verifiable increment: tests first, then the smallest implementation, then refactor. Read `CLAUDE.md` before starting.

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
- New config goes into the config schema, `.env.example` and the README table in the same change.
- Anything that touches personal data goes through the redaction serializer.
- If the spec is ambiguous or wrong, stop and ask; if a decision is made, record it as an ADR or an amendment in the spec in the same change.
- A task that adds a route also adds it to the OpenAPI output and the role table.
- Scripts must be cross-platform (Node.js or pnpm scripts, never bash-only); the owner develops on Windows.
- Keep each task's change small and readable. If a task grows past what the owner can review comfortably, split it and say so; the task list may be refined (with the owner's approval) but requirement coverage must stay complete.
- Define domain terms in `docs/GLOSSARY.md` the first time they appear.

## Task map

| Phase | Tasks | Outcome |
|---|---|---|
| A. Foundation | T01-T06 | Monorepo, contracts, config, database, server skeleton, CI |
| B. Safety and identity | T07-T13 | Redaction, audit, Redis adapters, auth, PIN, authorization |
| C. Wallet and transfers | T14-T24 | Ledger, idempotency, transfer lifecycle, rail, worker, reconciliation |
| D. Assistant | T25-T34 | Parsers, gateway, interpreter, policy, tools, pipeline, streaming, injection tests |
| E. Web and admin | T35-T38 | Customer chat, transfer UX, admin API and UI |
| F. Evaluation | T39-T41 | Dataset, NLU evaluator, workflow evaluator and gates |
| G. Observability and ship | T42-T44 | Telemetry, load and security suites, docs, staging attempt |

Review points (phase checkpoints) after T06, T13, T24, T34, T38, T41 and T44. In addition, the implementer pauses for review after **every** task (see step 7 above).

---

## Phase A: Foundation

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

### T02. Shared contracts package
- [ ] Done
- **Depends on:** T01
- **Covers:** FR-NLU-2, FR-NLU-4 (schema), NFR-MAINT-3 (base)
- **Spec:** API conventions and error table; F03 interpretation schema; DATA_MODEL conventions
- **Tests first:** Zod schema tests for the interpretation schema (valid, missing fields, extra fields rejected, unknown intent rejected, amount bounds); money helper tests (parse, format with Indian grouping, add and subtract, no float, overflow guard); error-code table test that every code has status, title and a message key; message-catalog completeness test skeleton (every key has en, hi, hi-Latn).
- **Build:** `packages/shared` with branded id types, money type and formatter, enums (intents, transfer statuses, roles, locales, screens), error-code table, problem+json schema, pagination schemas, card and message schemas, interpretation schema, confirm and cancel lexicon data, message catalogs (initially the keys needed so far).
- **Done when:** tests above pass; package exports are the only way other packages see these types.
- **Verify:** `pnpm --filter @sahayak/shared test:unit`, `pnpm typecheck`, `pnpm arch`.
- **Evidence:**

### T03. Configuration, logging and request context
- [ ] Done
- **Depends on:** T01, T02
- **Covers:** FR-OPS-5, FR-OBS-3, FR-SEC-6, NFR-SEC-5
- **Spec:** F06 (limits and hardening), F09 (logs, runtime), ARCHITECTURE section 9
- **Tests first:** config tests (missing required var names the variable and exits non-zero without printing secret values, too-short signing secret rejected, defaults applied, numeric parsing); logger test with in-memory sink (fields present, request id propagated through async context, sensitive keys redacted, no raw secrets).
- **Build:** Zod environment schema and loader (`.env.example` generated or checked against it by a test), pino logger with redaction hooks and async-local request context, clock port with fake clock for tests.
- **Done when:** AC-F06-11 (config part) and AC-F09-12 pass.
- **Verify:** `pnpm test:unit`, a manual run of the server entry with a missing variable (record output).
- **Evidence:**

### T04. Database migrations, roles and test harness
- [ ] Done
- **Depends on:** T01, T03
- **Covers:** FR-OPS-6, FR-AUD-3, NFR-REL-5 (system of record)
- **Spec:** DATA_MODEL (all tables, roles, indexes), F07 permissions
- **Tests first:** integration tests against real Postgres: migrations apply from scratch and rerun idempotently; the app role cannot ALTER, DROP or TRUNCATE and has INSERT and SELECT only on append-only tables; check constraints reject negative balances, non-INR currency, invalid status values; trigger blocks UPDATE and DELETE on `audit_log` and `ledger_entries`; the readonly role cannot write.
- **Build:** plain SQL migrations (or a minimal runner) for every table in DATA_MODEL including `v_transactions`; roles migrator, app and readonly; Kysely types generated or hand-maintained and checked; test harness that creates an isolated schema or database per test file and truncates between tests using the migrator role; seed script with the fixed demo data (users, beneficiaries including two Rahuls and the Devanagari alias, KB articles placeholder).
- **Done when:** AC-F09-18 passes; migrations documented.
- **Verify:** `pnpm db:migrate`, `pnpm test:int` (database suites).
- **Evidence:**

### T05. Server skeleton
- [ ] Done
- **Depends on:** T02, T03, T04
- **Covers:** FR-SEC-5 (headers, CORS, body limit), NFR-SEC-3, NFR-OBS-1, NFR-REL-4, NFR-MAINT-3
- **Spec:** API conventions and ops routes; ARCHITECTURE sections 9 and 10; F06 limits; F09 runtime
- **Tests first:** integration tests with `app.inject`: every error is problem+json with request id; unknown route is 404 problem body; body over 16 KB is 413; security headers present; CORS grants only allowlisted origins; `/healthz` ok; `/readyz` 503 when Postgres is down and degraded when only Redis is down; graceful shutdown test with a slow route; an unexpected exception returns `INTERNAL` without stack, SQL or path (AC-F06-12); route-registry test that fails if a route lacks a declared role list (deny by default).
- **Build:** Fastify app factory with Zod type provider, error handler mapping domain errors to the table, request id and trace id plumbing, route registration helper requiring `roles`, OpenAPI generation from schemas plus a contract test that compares the document with registered routes, `/metrics` stub on a protected path.
- **Done when:** AC-F06-10, AC-F06-12, AC-F09-13 pass.
- **Verify:** `pnpm test:int`, `pnpm test:contract`.
- **Evidence:**

### T06. Compose base and CI skeleton
- [ ] Done
- **Depends on:** T05
- **Covers:** FR-OPS-1 (partial), FR-OPS-3, FR-SEC-6, NFR-SEC-4, NFR-SEC-5
- **Spec:** F09 runtime; TESTING section 9
- **Tests first:** a CI workflow lint (actionlint if available) and a script test that every verification command from TESTING section 8 appears in CI or is explicitly listed as manual; a compose config validation (`docker compose config`).
- **Build:** `docker-compose.yml` with Postgres 16, Redis 7 and the api image (multi-stage, non-root user), health checks; `.github/workflows/ci.yml` with stages lint, typecheck, arch, unit, integration with service containers, build, `pnpm audit --audit-level=high`, secret scan (gitleaks); `.env.example`; Dockerfile for api.
- **Done when:** `docker compose up db redis` is healthy (if Docker is available; otherwise say not run); CI file validates. CI cannot be proven green until pushed: report it as "not run" until a real run exists.
- **Verify:** `docker compose config`, local `pnpm verify` for stages built so far.
- **Evidence:**

**Review point A.** Present: repo layout, command list, what ran and what did not.

---

## Phase B: Safety primitives and identity

### T07. Redaction and masking library
- [ ] Done
- **Depends on:** T02
- **Covers:** FR-SEC-3, NFR-PRIV-1
- **Spec:** F06 (personal-data redaction)
- **Tests first:** positive and negative table tests per pattern (phone, email, bank account, card with Luhn, PAN-like, Aadhaar-like, IFSC-like, UPI-like); amounts never redacted (`₹2,000`, `2000`, `Rs 500` survive); property test that masked output contains none of the sensitive substrings generated; account display mask `XXXX1234`; fuzz test that redaction never throws and is idempotent.
- **Build:** `core/redaction` with `redactText`, `maskAccount`, `redactObject` (deep, key-aware), and serializers for pino and OpenTelemetry attributes.
- **Done when:** AC-F06-5 passes; module has at least 90% branch coverage.
- **Verify:** `pnpm test:unit`, coverage report.
- **Evidence:**

### T08. Audit log service and verification
- [ ] Done
- **Depends on:** T04, T07
- **Covers:** FR-AUD-1 (service), FR-AUD-2, FR-AUD-3
- **Spec:** F07
- **Tests first:** canonicalization vectors (committed fixture); hash determinism; chain linearity with 20 parallel writers over 1,000 entries; tamper tests with a privileged connection (update detected at the right id, delete in the middle detected, delete of last row detected against anchor); app-role permission failures; rollback coupling with a business transaction; verification speed test (10,000 entries under 5 s) marked as a benchmark; details redaction test.
- **Build:** `AuditSink` port, Postgres adapter using an advisory lock and the same transaction handle, verifier (range walk, batches), anchor writer, scheduled verifier hook (wired into the worker later), metric registration hook for `audit_verification_ok`.
- **Done when:** AC-F07-2 to 10 and 12 pass (AC-F07-1 and 11 complete as features land).
- **Verify:** `pnpm test:int`, `pnpm test:unit`.
- **Evidence:**

### T09. Redis adapters
- [ ] Done
- **Depends on:** T03, T05
- **Covers:** FR-SEC-5 (rate limits), FR-CONV-3 (dialog store), FR-CONV-7 (counters), NFR-REL-5
- **Spec:** ARCHITECTURE section 7; F02 dialog state; F06 limits
- **Tests first:** rate limiter (sliding or fixed window, correct under parallel calls, shared across two limiter instances using the same Redis); dialog store TTL with fake clock; daily counter reset at midnight IST; behavior when Redis is down (general rate limits degrade to per-process limits, login throttling fails closed, dialog state is lost and the assistant asks again, readiness reports degraded; money paths never depend on Redis); circuit-breaker state store.
- **Build:** ports `RateLimiter`, `DialogStore`, `Counter`, `BreakerStore` with Redis and in-memory implementations; Fastify plugin applying per-user and per-IP limits; `rate_limited_total` metric hook.
- **Done when:** AC-F06-9 (limits across two replicas) and AC-F02-8 (TTL part) pass at unit and integration level.
- **Verify:** `pnpm test:unit`, `pnpm test:int`.
- **Evidence:**

### T10. Authentication, roles and login throttling
- [ ] Done
- **Depends on:** T05, T08, T09
- **Covers:** FR-AUTH-1, FR-AUTH-3, FR-AUTH-6, NFR-SEC-2
- **Spec:** F01
- **Tests first:** AC-F01 criteria for login success and failure with identical error for unknown user and wrong password, argon2id parameters, JWT claims and 900 s expiry, expired and tampered tokens rejected, roles enforced per route, deny by default, throttling (5 failures per 15 minutes per account and per IP) with fake clock, audit entries for each auth event.
- **Build:** user service, password hashing, token issue and verify, auth plugin that builds the principal, role guard, throttle using the T09 limiter.
- **Done when:** AC-F01-1, 2, 3, 6, 7, 10 (login, throttle and role events), 11 (password hash part) and 12 pass; `AUTH_*` errors match the API table.
- **Verify:** `pnpm test:unit`, `pnpm test:int`, `pnpm test:security` (auth subset).
- **Evidence:**

### T11. Refresh rotation and logout
- [ ] Done
- **Depends on:** T10
- **Covers:** FR-AUTH-2, NFR-SEC-2
- **Spec:** F01
- **Tests first:** refresh rotates and old token fails; reuse of a rotated token revokes the whole family and audits `auth.refresh_reuse_detected`; logout revokes the family; refresh tokens stored only as hashes (database inspection test); concurrent refresh with the same token yields one success.
- **Build:** refresh token repository, rotation with row lock, family revocation, endpoints.
- **Done when:** AC-F01-4, 5, 10 (refresh, reuse and logout events) and 11 (refresh-token hash part) pass.
- **Verify:** `pnpm test:int`, `pnpm test:security`.
- **Evidence:**

### T12. Profile, PIN and step-up state
- [ ] Done
- **Depends on:** T10
- **Covers:** FR-AUTH-5, FR-NLU-6 (preference storage)
- **Spec:** F01 (PIN, profile)
- **Tests first:** set and change PIN rules; wrong PIN counter, lock after three attempts for 15 minutes, correct PIN while locked rejected, unlock by fake clock and counter reset (AC-F01-9); PIN never logged or audited in clear; `preferred_locale` get and set.
- **Build:** PIN service (hashing, counters in Postgres so locking survives Redis loss), profile endpoints, seed PINs for demo users.
- **Done when:** AC-F01-9 (PIN lockout, with the confirm-route part completed in T20), AC-F01-10 (PIN events) and AC-F01-11 (PIN hash part) pass.
- **Verify:** `pnpm test:int`, `pnpm test:security`.
- **Evidence:**

### T13. Object-level authorization framework
- [ ] Done
- **Depends on:** T10, T04
- **Covers:** FR-AUTH-4, NFR-SEC-1 (BOLA, BFLA)
- **Spec:** F01; TESTING section 5
- **Tests first:** a generic matrix test that, for every resource route registered so far, calls it as another customer and expects the same 404 as a random id; role matrix test for admin routes (customer forbidden, support limited); test that fails when a route is added without an ownership test registration.
- **Build:** repository helpers that always take the principal, a `ownedBy` query convention, the route-test registry used by later tasks.
- **Done when:** AC-F01-8 passes for existing routes and the registry check is wired in `test:security`.
- **Verify:** `pnpm test:security`.
- **Evidence:**

**Review point B.** Present: auth model, audit proof (tamper tests), what Redis loss does.

---

## Phase C: Wallet and transfers

### T14. Ledger domain
- [ ] Done
- **Depends on:** T02
- **Covers:** FR-XFER-5 (domain rules), NFR-REL-1 (invariants)
- **Spec:** ARCHITECTURE section 6; DATA_MODEL ledger and wallets
- **Tests first:** pure functions `hold`, `settle`, `release`, `credit` with example tests; invariants (available and held never negative; sum of entries equals balances; HOLD then exactly one of SETTLE or RELEASE per transfer); property tests with random operation sequences (fast-check) that never violate invariants and reject illegal sequences.
- **Build:** `core/ledger` pure module returning new balances and the ledger entry to write; invariant checker usable by integration tests.
- **Done when:** property tests run at least 1,000 sequences, 90% branch coverage.
- **Verify:** `pnpm test:unit`.
- **Evidence:**

### T15. Wallet reads and transaction history
- [ ] Done
- **Depends on:** T04, T13, T14
- **Covers:** FR-INFO-1, FR-INFO-2
- **Spec:** F04 (balance, history), API wallet routes
- **Tests first:** balance endpoint; history filters (date range, direction, counterparty, limit), ordering, cursor stability while rows are inserted, maximum 50, notes returned as plain text (XSS string unchanged); ownership matrix entries.
- **Build:** wallet repo, `v_transactions` queries, endpoints, ownership registration.
- **Done when:** AC-F04-1 (data part), AC-F04-2, AC-F04-3 (data part), AC-F04-11 (API part) pass.
- **Verify:** `pnpm test:int`.
- **Evidence:**

### T16. Beneficiaries
- [ ] Done
- **Depends on:** T04, T13, T07
- **Covers:** FR-NLU-8 (data), FR-XFER-1 (beneficiary ownership)
- **Spec:** DATA_MODEL beneficiaries; API beneficiary routes; F03 recipient resolver (data only)
- **Tests first:** create and list own beneficiaries; masked account in responses (`XXXX1234`), never the full number; ownership; duplicate alias rules; Devanagari alias stored and normalized.
- **Build:** beneficiary repo, endpoints, normalization helper shared with the resolver.
- **Done when:** the tests pass and full account numbers appear only in the table, never in responses or logs.
- **Verify:** `pnpm test:int`, `pnpm test:security`.
- **Evidence:**

### T17. Idempotency store
- [ ] Done
- **Depends on:** T04, T08
- **Covers:** FR-XFER-4
- **Spec:** API idempotency section; F05 rules; ADR-006
- **Tests first:** claim then replay returns the same body and status with `Idempotent-Replay: true`; same key with a different request hash returns `IDEMPOTENCY_KEY_REUSED`; 100 parallel claims produce one executor and 99 waiters that return the stored result (waiting up to 5 s, then a documented retryable error); a failed attempt releases the key; keys scoped per user; expiry after 24 h with fake clock.
- **Build:** `IdempotencyStore` port with Postgres adapter using insert-on-conflict and row locks, request hashing helper, Fastify helper for routes that require the header.
- **Done when:** the unit and integration tests pass, coverage at least 90% branch.
- **Verify:** `pnpm test:unit`, `pnpm test:int`, `pnpm test:reliability` (idempotency subset).
- **Evidence:**

### T18. Transfer state machine and repository
- [ ] Done
- **Depends on:** T14, T08
- **Covers:** FR-XFER-5, FR-XFER-8 (states), FR-AUD-1 (transfer events)
- **Spec:** ARCHITECTURE section 6; F05; DATA_MODEL transfers and events
- **Tests first:** AC-F05-25 enumerating every status pair; each allowed transition writes an event and an audit entry in the same transaction; illegal transitions raise and persist nothing; snapshot hash determinism (canonical JSON vectors); random public reference generation is non-sequential.
- **Build:** pure `transitions` table and `applyTransition`, transfer repo with locked reads (`FOR UPDATE`), event writer, snapshot builder and hasher.
- **Done when:** the enumeration test passes with 100% of status pairs covered.
- **Verify:** `pnpm test:unit`, `pnpm test:int`.
- **Evidence:**

### T19. Prepare transfer
- [ ] Done
- **Depends on:** T15, T16, T18
- **Covers:** FR-XFER-1, FR-XFER-2 (summary data), FR-XFER-12, FR-XFER-8 (cancel, supersede)
- **Spec:** F05 behavior 1, 2, 7; API transfer routes
- **Tests first:** AC-F05-1, 2, 3, 23; limits configurable; IST day boundary test at 23:59:59 and 00:00:00; summary template golden outputs for en, hi, hi-Latn (AC-F05-4, the template catalog entries are created here); expiry timestamp from the database clock.
- **Build:** prepare service and `POST /v1/transfers`, cancel service and endpoint, supersede logic, summary templates, daily-limit query.
- **Done when:** AC-F05-1 to 4 and 23 pass; no ledger rows are written by prepare.
- **Verify:** `pnpm test:unit`, `pnpm test:int`.
- **Evidence:**

### T20. Confirm transfer
- [ ] Done
- **Depends on:** T12, T17, T19
- **Covers:** FR-XFER-3 (API channel), FR-XFER-4, FR-XFER-5, FR-XFER-10, FR-AUTH-5 (enforcement)
- **Spec:** F05 behavior 3 (button/API) and 4; ADR-005, ADR-006
- **Tests first:** AC-F05-5 to 13, including the fault-injection rollback, 100 parallel same-key confirms, 20 parallel different-key confirms, two transfers racing for one balance, expiry by database clock, hash mismatch, balance dropped, PIN required, wrong PIN not consuming the key.
- **Build:** confirm service in one transaction with the lock order transfer then wallet, outbox insert, audit insert last, endpoint with idempotency helper.
- **Done when:** the listed criteria pass with real commits (not mocked transactions); ledger invariant checker run after each test.
- **Verify:** `pnpm test:int`, `pnpm test:reliability`.
- **Evidence:**

### T21. Mock payment rail
- [ ] Done
- **Depends on:** T01, T02
- **Covers:** FR-XFER-6 (counterparty), supports NFR-REL-1
- **Spec:** API mock-rail section; F05 behavior 5 and 6
- **Tests first:** `POST /payouts` idempotent on `client_reference`; modes: normal, reject, slow, timeout, error_5xx, pending_then_complete, lost_response (executes but drops the reply), duplicate_response; `GET /payouts/by-reference/:id`; 404 for unknown reference; mode set per reference or globally through a control endpoint protected by a token; payout count endpoint for tests.
- **Build:** small Fastify app with in-memory (or SQLite-free JSON) store and a deterministic scheduler for pending transitions; Dockerfile.
- **Done when:** its contract tests pass and the rail's OpenAPI matches `API.md`.
- **Verify:** `pnpm --filter @sahayak/mock-rail test:unit`, `pnpm test:contract`.
- **Evidence:**

### T22. Outbox worker and payout submission
- [ ] Done
- **Depends on:** T20, T21
- **Covers:** FR-XFER-6, NFR-SCAL-2, NFR-REL-3
- **Spec:** F05 behavior 5; ADR-007
- **Tests first:** AC-F05-16, 17, 18, 21; schema validation of rail responses; backoff schedule with fake clock (about 1 s, 4 s, 16 s plus jitter bounds); two workers racing for one row (`SKIP LOCKED`); outbox lag metric; poison messages go to a failed state with an alert metric.
- **Build:** worker entry point, outbox claimer, rail client with timeout and schema validation, settle and release transactions (ledger plus status plus event plus audit), retry scheduling by `available_at`.
- **Done when:** the listed criteria pass against `mock-rail` in integration tests.
- **Verify:** `pnpm test:int`, `pnpm test:reliability`.
- **Evidence:**

### T23. Reconciliation, expiry and manual resolution
- [ ] Done
- **Depends on:** T22
- **Covers:** FR-XFER-7, FR-XFER-8 (expiry), FR-ADM-1 (services)
- **Spec:** F05 behavior 6 and 7; API admin transfer routes
- **Tests first:** AC-F05-11 (expiry job vs database clock), 19, 22; reconcile schedule; rail 404 leads to re-submit; 24 h to NEEDS_REVIEW; admin resolve only for NEEDS_REVIEW, requires a reason, applies the ledger effect once, audits; reconcile-now endpoint.
- **Build:** reconcile job type, expiry job, stuck-transfer gauge, admin services and endpoints (UI comes in T38).
- **Done when:** the listed criteria pass.
- **Verify:** `pnpm test:int`, `pnpm test:reliability`.
- **Evidence:**

### T24. Transfer reliability suite
- [ ] Done
- **Depends on:** T20, T22, T23
- **Covers:** NFR-REL-1, NFR-REL-5, NFR-SCAL-2, FR-XFER-9 (data truth)
- **Spec:** F05 AC-F05-8 to 10, 18 to 22, 24, 26; TESTING reliability family
- **Tests first:** crash test that kills the worker process after the rail call and before the database update, then restarts it (AC-F05-20); property test over random sequences of prepare, confirm, cancel, expire, rail outcomes and reconcile (AC-F05-24); Redis stopped during confirm (AC-F05-26); a final invariant sweep over the database after the whole suite.
- **Build:** test utilities only (process control, fault toggles); fix any defect found in earlier tasks by adding a failing test first.
- **Done when:** `pnpm test:reliability` passes and the report lists the number of random sequences run.
- **Verify:** `pnpm test:reliability`.
- **Evidence:**

**Review point C.** Present: ledger invariants, the reliability suite output, any defects found and fixed.

---

## Phase D: Assistant

### T25. Deterministic understanding helpers
- [ ] Done
- **Depends on:** T02
- **Covers:** FR-NLU-1, FR-NLU-3, FR-NLU-5, FR-NLU-6 (detection)
- **Spec:** F03 (languages, amount parser, date resolver)
- **Tests first:** AC-F03-1, 2, 3, 10 using the tables in F03 plus the extra cases; fuzz test that no parser throws on arbitrary strings; property test for amount formatting round trip; ambiguity returns all candidates.
- **Build:** `core/nlu` modules: normalize, detect language, parse amounts, resolve dates (Asia/Kolkata, Monday weeks), abbreviation expansion, Hinglish word list.
- **Done when:** the criteria pass; modules are pure and take a `Clock`.
- **Verify:** `pnpm test:unit`.
- **Evidence:**

### T26. Recipient resolver
- [ ] Done
- **Depends on:** T16, T25
- **Covers:** FR-NLU-8
- **Spec:** F03 recipient resolver
- **Tests first:** AC-F03-7 cases (Rohan, Devanagari alias, Rahul ambiguous, Rahull, Rohn too short, unknown); honorific stripping; tier ordering; resolver never returns data about other users.
- **Build:** pure resolver over a list of the user's beneficiaries plus a repo-backed wrapper.
- **Done when:** AC-F03-7 passes.
- **Verify:** `pnpm test:unit`, `pnpm test:int`.
- **Evidence:**

### T27. LLM gateway
- [ ] Done
- **Depends on:** T03, T04, T07, T09
- **Covers:** NFR-REL-2, NFR-COST-1, FR-NLU-4 (transport), supports FR-CONV-5
- **Spec:** ARCHITECTURE section 8; ADR-004
- **Tests first:** timeout at 15 s (fake timers), 2 retries with jitter on 429 and 5xx, no retry on 4xx, circuit opens after 5 consecutive failures for 30 s and closes after a success (state shared via the breaker store), token caps passed through, every call writes `llm_calls` with masked prompt and response and an outcome, prompt redaction applied for untrusted providers, API keys never in logs, scripted fake LLM (queue of responses, delays, errors, captured requests).
- **Build:** `LlmClient` port, OpenAI-compatible adapter (works for Gemini's compatible endpoint, Ollama and others via base URL), breaker, `llm_calls` writer, scripted fake in `packages/llm/testing`.
- **Done when:** the listed behaviors pass; request capture is available for AC-F03-8 and AC-F06-4 and 7.
- **Verify:** `pnpm test:unit`, `pnpm test:int`.
- **Evidence:**

### T28. Interpreter
- [ ] Done
- **Depends on:** T25, T27
- **Covers:** FR-NLU-2, FR-NLU-3, FR-NLU-4, FR-NLU-5, FR-NLU-7, FR-SEC-2 (prompt side)
- **Spec:** F03 interpreter and cross-checks; ADR-004
- **Tests first:** AC-F03-4, 5, 6, 9; low confidence and multiple-intent handling; prompts contain only allowed context (AC-F03-8 via request capture); delimiters around user text; few-shot examples present per language.
- **Build:** prompt builder, structured-output call with Zod validation, one repair call, cross-check module, interpretation result type with `needs` and `reason`.
- **Done when:** the criteria pass using only the scripted LLM; no network used.
- **Verify:** `pnpm test:unit`.
- **Evidence:**

### T29. Policy engine and tool registry
- [ ] Done
- **Depends on:** T02, T08
- **Covers:** FR-SEC-1, FR-NLU-2 (closed intents), FR-CONV-7 (tool cap)
- **Spec:** F06 (policy engine, tool registry); ADR-003
- **Tests first:** AC-F06-1 (every row), AC-F06-2 (schema walk, no confirm tool, unknown tool, model-proposed confirm denied with audit), AC-F05-15; tool cap of 4 per turn; Zod input validation with unknown fields rejected.
- **Build:** `core/policy` pure `decide`, `core/tools` registry with seven tool definitions (handlers injected), role allowlists.
- **Done when:** the criteria pass with 90% branch coverage.
- **Verify:** `pnpm test:unit`, `pnpm test:security`.
- **Evidence:**

### T30. Information tools, templates and navigation
- [ ] Done
- **Depends on:** T15, T19, T29, T25
- **Covers:** FR-INFO-1, FR-INFO-2, FR-INFO-3, FR-NAV-1, FR-NLU-6 (reply locale), FR-XFER-9
- **Spec:** F04 (balance, history, status, navigation, small talk)
- **Tests first:** AC-F04-1, 3, 4, 5, 7, 10; template completeness test (every key in en, hi, hi-Latn, AC-F03-11); status wording table; Indian grouping formatter in every locale; navigation allowlist.
- **Build:** tool handlers, templates and catalogs (balance, history, status, navigation, small talk, capabilities, errors), card builders.
- **Done when:** the listed criteria pass.
- **Verify:** `pnpm test:unit`, `pnpm test:int`.
- **Evidence:**

### T31. Knowledge base, FAQ composer, output guard and tickets
- [ ] Done
- **Depends on:** T07, T27, T29, T08
- **Covers:** FR-SUP-1, FR-SUP-2, FR-SEC-4
- **Spec:** F04 (FAQ, tickets); F06 (output guard)
- **Tests first:** AC-F04-8, 9; AC-F06-8; full-text search ranking with English and Hinglish keyword tags; composer output validation (ids subset, length); ticket masking and rate limit; support and admin ticket listing with ownership.
- **Build:** KB seed (12 to 15 curated articles in three locales), search repo, FAQ composer prompt and validator, output guard module, ticket service and endpoints.
- **Done when:** the criteria pass.
- **Verify:** `pnpm test:unit`, `pnpm test:int`, `pnpm test:security`.
- **Evidence:**

### T32. Turn pipeline orchestration
- [ ] Done
- **Depends on:** T09, T12, T20, T26, T28, T29, T30, T31
- **Covers:** FR-CONV-3, FR-CONV-4, FR-CONV-5, FR-CONV-7, FR-XFER-3 (typed channel), FR-XFER-9, NFR-PERF-2
- **Spec:** F02; F05 behavior 3 (typed); ARCHITECTURE section 5
- **Tests first:** AC-F02-4, 5, 6, 8, 10, 11, 12, 13; AC-F05-14 (lexicon, no LLM call); fallback decision table; clarification counter; `PROVIDE_SLOT` continuation; per-turn tool cap; benchmark for turn overhead.
- **Build:** `core/pipeline` with ports, dialog state transitions, typed-confirm handler, fallback logic, responder, persistence of messages, tool invocations and `llm_calls` links.
- **Done when:** the listed criteria pass with the scripted LLM through the pipeline function (HTTP comes next).
- **Verify:** `pnpm test:unit`, `pnpm test:int`.
- **Evidence:**

### T33. Conversation API and streaming
- [ ] Done
- **Depends on:** T32, T13
- **Covers:** FR-CONV-1, FR-CONV-2, FR-CONV-6, FR-CONV-7, NFR-PERF-3 (first event)
- **Spec:** F02; API conversation routes and SSE
- **Tests first:** AC-F02-1, 2, 3, 7, 9; SSE ordering test with a real HTTP client; JSON mode; abort mid-turn still persists; `client_message_id` replay makes zero LLM calls; ownership matrix entries; first event timing check with the scripted model.
- **Build:** routes, SSE writer, request-scoped abort handling, `Accept` negotiation.
- **Done when:** the criteria pass.
- **Verify:** `pnpm test:int`, `pnpm test:security`, `pnpm test:contract`.
- **Evidence:**

### T34. Injection and guardrail end-to-end tests
- [ ] Done
- **Depends on:** T33
- **Covers:** FR-SEC-2, FR-SEC-3, FR-SEC-4, NFR-SEC-1 (LLM-specific)
- **Spec:** F06 AC-F06-3, 4, 6, 7; TESTING evaluation and OWASP sections
- **Tests first:** the injection corpus (at least 30 payloads, en/hi/hi-Latn) as a data file run through the HTTP API with a scripted model that obeys the injection (worst case); assertions: no state change, no forbidden tool, no canary, no foreign identifiers; seeded injection text in beneficiary names and notes never reaches any captured LLM request; log capture proves no raw phone, email or PAN-like value anywhere.
- **Build:** corpus file, scripted "hijacked model" behaviors, log capture helpers; fix defects found by adding failing tests first.
- **Done when:** the whole corpus passes and `pnpm test:security` includes it.
- **Verify:** `pnpm test:security`.
- **Evidence:**

**Review point D.** Present: pipeline behaviors, injection results, the list of scripted-model-only claims (nothing about live-model quality yet).

---

## Phase E: Web and admin

### T35. Web app shell and chat
- [ ] Done
- **Depends on:** T33
- **Covers:** FR-UI-1 (chat), NFR-UX-1, NFR-UX-2
- **Spec:** F09 web client
- **Tests first:** component tests for cards and catalogs (text rendered as text, XSS strings literal); Playwright: login, send message, streamed reply, chips, language switch, keyboard-only flow, first feedback under 300 ms with the scripted model; axe checks on login and chat.
- **Build:** Vite React app, API client with SSE reader, TanStack Query, auth in memory, catalogs from `shared`, card components, accessible layout with live region.
- **Done when:** AC-F09-15 (login, balance, language switch parts), AC-F09-16 (login and chat pages) and AC-F09-17 pass.
- **Verify:** `pnpm test:e2e`.
- **Evidence:**

### T36. Transfer UX and fallback mode
- [ ] Done
- **Depends on:** T35, T20, T22
- **Covers:** FR-UI-1 (confirmation, status), FR-UI-2, FR-INFO-4
- **Spec:** F09 web client; F04 status polling; F05
- **Tests first:** Playwright: transfer with confirm, with PIN, cancel, expiry countdown, double-click confirm sends one effective request, live status card updates to COMPLETED within 5 s, fallback mode with the LLM disabled (chips call wallet APIs, prepare form works), XSS note shown literally.
- **Build:** confirmation card with PIN, status card with polling, fallback forms, error states with request id.
- **Done when:** AC-F04-6, AC-F09-15 and AC-F09-16 (confirmation card) pass.
- **Verify:** `pnpm test:e2e`.
- **Evidence:**

### T37. Admin API
- [ ] Done
- **Depends on:** T23, T31, T33, T08
- **Covers:** FR-ADM-1, FR-ADM-2, FR-AUD-1 (admin actions)
- **Spec:** API admin routes; F09 admin console; F07
- **Tests first:** AC-F09-1, 2, 7 (API part); masked transcripts by default; unmask requires reason and admin role and writes the audit entry; every admin read of other users' data is audited; filters and pagination; verify endpoint wiring.
- **Build:** admin routes and services, transcript assembler (interpretations and tool calls), unmask flow.
- **Done when:** the criteria pass and the role matrix test covers every admin route.
- **Verify:** `pnpm test:int`, `pnpm test:security`.
- **Evidence:**

### T38. Admin UI
- [ ] Done
- **Depends on:** T37, T36
- **Covers:** FR-ADM-1
- **Spec:** F09 admin console
- **Tests first:** Playwright as admin: conversation inspector (masked, then unmask with reason), transfer monitor with reconcile and resolve (AC-F09-3), audit page with verify and tamper detection (AC-F09-4), LLM calls, tickets; support role sees only conversations and tickets; axe checks on admin pages.
- **Build:** admin pages and navigation guarded by role (server enforcement remains primary).
- **Done when:** AC-F09-3, 4, 16 (admin pages) pass.
- **Verify:** `pnpm test:e2e`.
- **Evidence:**

**Review point E.** Present: screenshots from Playwright runs (stored as artifacts), a11y results.

---

## Phase F: Evaluation

### T39. Dataset, validator and metrics
- [ ] Done
- **Depends on:** T28
- **Covers:** FR-EVAL-1, FR-EVAL-2 (metric code)
- **Spec:** F08
- **Tests first:** AC-F08-1, 2, 4 (validator mutation tests, composition minimums, metric math against hand-computed fixtures including Wilson interval and percentiles).
- **Build:** author the 240-plus case dataset (realistic phrasing, balanced as F08 specifies, manifest with version and authorship note), validator CLI, metrics library.
- **Done when:** the dataset check passes; the report states the case counts per group.
- **Verify:** `pnpm test:unit`, `pnpm eval:check`.
- **Evidence:**

### T40. NLU evaluator, reports and comparison
- [ ] Done
- **Depends on:** T39, T27, T37
- **Covers:** FR-EVAL-2, FR-EVAL-4, NFR-AI-1
- **Spec:** F08 NLU evaluator and model comparison
- **Tests first:** AC-F08-3, 5, 8, 9, 10 using the scripted model (expected and perturbed); incomplete run exits non-zero; provider outage counted as errors; comparison output on two stored fixtures; README results script refuses hand-typed numbers.
- **Build:** `pnpm eval:nlu`, `pnpm eval:compare`, database writers, Markdown report generator, admin endpoints already in T37 are exercised here. Each run also writes its JSON and Markdown report to `docs/eval-results/`, which is committed, because the database is local to each machine: live Qwen3 runs happen on the owner's desktop PC (RTX 5060, 8 GB, Ollama), and the committed reports are how those results reach the laptop and the README. Include a short `docs/LOCAL_MODEL.md` with the PC setup steps (install Ollama, pull `qwen3:4b` and `qwen3:8b`, set the model environment variables, run the evaluation), written from what was actually done.
- **Done when:** scripted-model runs complete and store results, and the report shows per-language metrics and the amount cross-check mismatch rate (AC-F03-12). Live Gemini and Ollama runs are separate manual steps for the owner: document the commands; do not report live results unless they were actually run.
- **Verify:** `pnpm eval:nlu --provider scripted`.
- **Evidence:**

### T41. Workflow evaluator and CI gates
- [ ] Done
- **Depends on:** T34, T36, T40
- **Covers:** FR-EVAL-3, FR-EVAL-5
- **Spec:** F08 workflow evaluator, CI gates
- **Tests first:** AC-F08-6 and 7 (a deliberately broken fixture makes the evaluator fail on unsafe action or duplicate execution); 25-plus scenarios listed in F08.
- **Build:** scenario DSL and runner against the real HTTP API and `mock-rail`, report writer, CI job `eval-gate` (no network, no keys).
- **Done when:** `pnpm eval:workflow` passes all scenarios with zero unsafe actions and zero duplicate executions; the CI job is defined (green status only after a real run).
- **Verify:** `pnpm eval:workflow`.
- **Evidence:**

**Review point F.** Present: eval report (scripted), explicit list of what remains manual.

---

## Phase G: Observability, scale and ship

### T42. Metrics, traces, dashboards and alerts
- [ ] Done
- **Depends on:** T33, T22
- **Covers:** FR-OBS-1, FR-OBS-2, FR-OBS-3 (log checks), FR-OPS-2, NFR-OBS-1, NFR-OBS-2
- **Spec:** F09 observability; ARCHITECTURE section 11
- **Tests first:** AC-F09-5, 6, 8, 9; metric registry test (every metric named in specs exists; labels are bounded enums); trace test using an in-memory exporter for one full turn including a transfer confirm and a worker submit; alert rule lint.
- **Build:** Prometheus client wiring, OpenTelemetry SDK setup with redacting span processor, Grafana provisioning (four dashboards), Prometheus rules, Jaeger in the `observability` compose profile.
- **Done when:** the automated criteria pass; AC-F09-10 is verified manually if Docker is available and recorded as manual.
- **Verify:** `pnpm test:int`; `docker compose --profile observability config`.
- **Evidence:**

### T43. Load tests, security suite and performance report
- [ ] Done
- **Depends on:** T42, T34
- **Covers:** NFR-PERF-1, NFR-PERF-3, NFR-PERF-4, NFR-SCAL-1, NFR-SCAL-3, NFR-SEC-1, NFR-MAINT-2, NFR-MAINT-3
- **Spec:** TESTING sections 4, 5, 7, 8
- **Tests first:** k6 scripts for read endpoints, confirm and a mixed workload with thresholds from the PRD; 3-replica compose scale test (AC-F09-14); the OWASP mapping test file lists every applicable item and fails if any has no test; coverage gate for the 90% modules; OpenAPI contract test.
- **Build:** `pnpm loadtest`, compose override for 3 replicas with a reverse proxy, `docs/PERFORMANCE.md` generated from actual runs with machine details; no number is written unless measured.
- **Done when:** AC-F05-27 and AC-F09-14 are measured, the suites for AC-F06-13 run, and thresholds are reported as met or not met honestly. If k6 or Docker is unavailable the report says "not run".
- **Verify:** `pnpm test:security`, `pnpm loadtest`, `pnpm test:contract`.
- **Evidence:**

### T44. Documentation, ADRs, staging attempt and release check
- [ ] Done
- **Depends on:** T41, T43
- **Covers:** FR-OPS-1, FR-OPS-4, NFR-MAINT-4, NFR-OPS-1, NFR-SCAL-4, NFR-SEC-4 (container), NFR-COST-1
- **Spec:** all ADRs; README; F09 runtime
- **Tests first:** a fresh-clone script (clone to a temp directory, follow the README commands, reach a healthy stack and a successful demo login) run in CI where Docker exists; a link checker for docs; a script that checks the README results table against stored eval runs (AC-F08-9); container user check (non-root).
- **Build:** `docs/DEMO.md`: a short project pitch, a 10-minute demo script covering the main flows and one failure demonstration using the rail fault modes, an architecture overview with a diagram, and the honest list of limits. Before the repository goes public: update the status lines in `specs/README.md` so they describe what is actually built and add a README note that the project was built with AI assistance (Claude Code) using spec-driven development. Then README (quick start in under 10 minutes, architecture overview, demo script with Hinglish transfer, failure demo using rail fault modes, results section from real runs only), finalize ADR statuses, `docs/SCALING.md` (documented paths: read replicas, ledger partitioning, queue extraction, separate gateway, plus a section "From modular monolith to microservices": which pieces would be split first and why (the stateless assistant and LLM gateway), what must stay together (wallet, ledger, transfers, idempotency, outbox), database-per-service and why it ends cross-service transactions, how the transfer becomes a saga using the existing hold, settle and release steps as the compensation, how the outbox feeds a broker, and the new failure modes this introduces), `docs/SECURITY.md` (threat model summary and honest limits), `docs/STAGING.md` after a real free-tier attempt (or an honest statement that it was not attempted), final `pnpm verify`.
- **Done when:** a clean clone reaches a working demo following the README (AC-F09-11, with the memory budget measured by `docker stats` or reported as not run); AC-F09-19 and AC-F09-20 hold; `pnpm verify` result is recorded exactly; open issues are listed.
- **Verify:** `pnpm verify`, fresh-clone script.
- **Evidence:**

**Review point G (final).** Present: what is verified (with command output), what is not, how to run the live evals, the staging outcome.

---

## Out of scope for this plan

Real payment rails, real KYC, native mobile apps, voice, multi-currency, push notifications, fine-tuning a model, FR-XFER-11 (signed webhook, Could), and the trusted-provider redaction bypass (Could). They are listed as future work in the README.

## Requirement coverage rule

Every Must and Should requirement in `PRD.md` appears in at least one task's **Covers** line, and every task's **Covers** ids exist in the PRD. A script (`pnpm spec:check`, created in T01 as a placeholder and completed in T44) must verify this and fail on gaps. Could items are exempt.
