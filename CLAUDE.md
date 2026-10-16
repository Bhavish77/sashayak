# CLAUDE.md: Sahayak (multilingual wallet assistant)

You are implementing a project whose specifications are already written. Do not redesign it. Build it task by task from `specs/IMPLEMENTATION_PLAN.md`, using spec-driven and test-driven development.

## What this project is

Sahayak is a set of five Node.js/TypeScript services (`edge`, `assistant`, `wallet`, `transfers`, `audit`), a simulated payment rail and a React web client for a multilingual (English, Hindi, Hinglish) wallet assistant. Users check balances, view history, ask for help and send money by chatting. The language model only proposes an interpretation; deterministic code decides and acts. Each service owns its database. A transfer is an orchestrated saga run by `transfers`: a hold in `wallet`, a payout at the simulated rail (with fault injection), then settle or release, with idempotent commands, a transactional outbox, RabbitMQ events, reconciliation, a watchdog, and a hash-chained audit log built from events in `audit`. All data is synthetic. Free tools only.

Read in this order: `specs/README.md`, `specs/PRD.md`, `specs/ARCHITECTURE.md`, then the feature spec, the contract files (`specs/API.md`, `specs/INTERNAL_API.md`, `specs/EVENTS.md`, `specs/DATA_MODEL.md`) and the ADRs for the task you are on.

## Operating rules (non-negotiable)

1. **Specs first.** The specs are the source of truth. If code and spec disagree, stop and report; fix the spec (with approval) or the code, never silently diverge. Record any decision in an ADR or a spec amendment in the same change.
2. **Ask about ambiguity.** If a requirement is unclear, conflicts with another, or the plan seems wrong, stop and ask the owner. Do not guess on money, security or data-model questions.
3. **One task at a time**, in the order of the plan, respecting dependencies. Do not start a task before its dependencies are checked. Do not mix tasks in one commit.
4. **Red, green, refactor.** Write the tests listed under the task's *Tests first* and run them to see them fail for the right reason. Then implement the smallest change that passes. Then refactor with tests green.
5. **Never weaken tests.** Do not delete, skip, loosen or rewrite a test to make it pass. If a test is wrong, explain why and get approval first.
6. **Never claim a check passed unless you ran it.** Report exactly which commands ran and their results. If something could not run (no Docker, no key, no GPU), write "not run" and why. No invented numbers in docs, READMEs or reports (performance, accuracy, coverage).
7. **Small verifiable increments.** Each task ends with its *Done when* criteria demonstrably met.
8. **Pause after every task**: report, then wait for the owner's go-ahead before starting the next task. At each phase checkpoint listed in the plan, also present a short recap for approval.

## Engineering constraints

- Prefer plain, readable code over clever code. Comment the reason behind non-obvious decisions, not what the line does. Keep each task's diff small; if it grows, split the task and say so. Define domain terms in `docs/GLOSSARY.md` when they first appear.
- Node.js 22, TypeScript strict, Fastify with Zod, Kysely over `pg`, RabbitMQ (`amqplib`), React with Vite and TanStack Query, Vitest, fast-check, Playwright, k6, pnpm workspaces, dependency-cruiser. Use these; propose an ADR before adding another core dependency.
- Money is integer paise (`*_minor`). No floating point near money. Currency is INR.
- The model has no authority: it cannot confirm, cancel, execute, choose a user id, or write facts shown to users (see ADR-003, ADR-008, ADR-013). Do not add a tool or intent without a policy row, tests and a threat-model update.
- Never put beneficiary data, balances, transaction notes or ledger rows into a prompt.
- All logs, traces, stored LLM calls and audit details go through the redaction serializer. Never log message text, PINs, tokens or secrets.
- Every route declares its allowed roles; ownership checks return 404 for other users' objects.
- Database: the application role has no DDL rights and cannot update or delete append-only tables. Use the migrator role only in migrations and test setup.
- Each service's own Postgres database is the system of record for its data. Redis may be lost without affecting money state; losing RabbitMQ delays events but loses none, because committed outbox rows survive.
- Service boundaries (ADR-015): an app never imports another app and never connects to another service's database (separate credentials make that impossible); shared code lives in `packages/shared` (contracts and pure utilities) and `packages/platform` (infrastructure kit, no business rules). `pnpm arch` enforces this.
- No remote call inside a database transaction. Commit first, call after, apply the answer in a new transaction (ADR-016). Every state change that must be announced writes its outbox row in the same transaction.
- Internal routes live on a separate listener, are never routed by the proxy or `edge`, require a signed service token and an access-matrix entry (ADR-018). Every service verifies user tokens itself. Only `edge` holds the user-token and step-up private keys; keys come from environment variables (`pnpm keys:generate` for development), never from the repository.
- Transfer saga rules: commands are idempotent per transfer id; a step's result is applied only if the transfer is still in the status that step expects (state guard); the wallet refuses conflicting commands and a release before a hold leaves a tombstone. Lock order inside a service: transfer row in `transfers`, wallet row in `wallet`. Never lock across services.
- The owner works on Windows. Every script in the repository must run on Windows, macOS and Linux: write them in Node.js or as pnpm scripts, never bash-only. Docker Desktop is needed for integration tests, end-to-end tests and the compose stack. At the start of T01, check which tools are installed (Node 22, pnpm, Git, Docker) and report; ask before installing anything.
- No secrets in the repository. Configuration comes from validated environment variables; keep `.env.example` current.
- Use the free stack: Gemini free tier or local Ollama (Qwen3) for live runs; the scripted fake model for tests and CI. Never require a paid service. Do not add network calls to tests.
- Two machines: development starts on a laptop without a usable GPU; the live local-model (Qwen3 through Ollama) runs happen later on the owner's desktop PC (8 GB GPU) after pulling the code from GitHub. Nothing before T53 may require a GPU. Model URL, model name and keys come only from environment variables. `.env` files never go to GitHub; only `.env.example` does. Anything the PC produces that the laptop needs (such as evaluation reports) is a committed file, not database content.

## Commands

Defined in `specs/TESTING.md` section 8. The ones you will use most:

| Command | Purpose |
|---|---|
| `pnpm lint` / `pnpm typecheck` / `pnpm arch` | Static checks and boundary rules |
| `pnpm test:unit` / `pnpm test:int` | Unit and property tests; per-service integration with real Postgres, Redis and RabbitMQ |
| `pnpm test:contract` / `pnpm test:reliability` / `pnpm test:security` | Provider and consumer contracts, concurrency and faults, authorization and injection |
| `pnpm test:system` | Cross-service suite on the compose stack: kill at every saga step, broker faults, isolation, consistency |
| `pnpm test:e2e` | Playwright against the compose stack |
| `pnpm sweep:consistency` / `pnpm stack:reset` / `pnpm seed:check` / `pnpm keys:generate` | Cross-service invariant checks, reset the local stack, check seed ids, create development keys |
| `pnpm eval:check` / `pnpm eval:nlu` / `pnpm eval:workflow` | Dataset check and evaluations |
| `pnpm spec:check` | Requirement traceability between PRD and plan |
| `pnpm verify` | The CI-equivalent set |

The scripts are created by task T01 and filled in as features land. Until a suite exists, list it as "not built yet" in the report, not as passed.

## Task report (produce after every task)

```
Task: T## title
Status: done | blocked | partial
Spec references: files and AC ids addressed
What changed: short list of files/modules
Tests written first: names, and how each failed before the implementation
Commands run: command, result (pass/fail with counts)
Not run: command and reason
Deviations or open questions: anything that differs from the spec, any ambiguity found
Risks / follow-ups:
Plan updated: box ticked, Evidence line filled
Waiting for: the owner's go-ahead to continue
```

Then tick the task's checkbox in `specs/IMPLEMENTATION_PLAN.md` and fill its **Evidence** line with the same facts (short).

## Git

Small commits, one task per commit or short series, message starts with the task id (for example `T27: confirm accepts and queues the hold`). Do not rewrite shared history. Do not commit generated reports containing machine-specific numbers unless the task says so.

## Definition of done for any task

Acceptance criteria listed under *Done when* pass; new behavior has tests; `pnpm lint`, `pnpm typecheck` and `pnpm arch` pass; affected suites pass; docs and OpenAPI updated; report written; nothing claimed that was not run; paused for review.

## Known limits to be honest about

- Tamper-evident audit log, not tamper-proof (ADR-009); audit entries arrive by events, so audit visibility lags by seconds and the business never waits for it (ADR-019).
- The saga is hand-built and the services share one Postgres container and one compose network; a production system would add a workflow engine, mutual TLS and separate database servers (ADR-015, ADR-016). Consistency between services is eventual and checked by the sweep, not by distributed transactions.
- Small dataset written by the owner; metrics are indicative, with intervals (F08).
- Hindi/Hinglish catalog wording needs review by a fluent speaker before any real use (ADR-013).
- Public staging on free tiers is a stretch goal; document what actually happened.
