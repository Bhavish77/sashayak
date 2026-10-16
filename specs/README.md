# Sahayak specifications

Status: **draft for approval.** Nothing has been implemented. Nothing in these files has been tested; where a spec says a check "passes", that is a requirement for the implementation, not a result.

Sahayak is a multilingual (English, Hindi, Hinglish) AI wallet assistant built to demonstrate safe execution of financial actions by an LLM-driven system: the model proposes, deterministic policy disposes. It is built as five small services (`edge`, `assistant`, `wallet`, `transfers`, `audit`) plus a simulated payment rail: money moves through an orchestrated saga (hold, payout, settle or release) with idempotent commands, a transactional outbox, RabbitMQ events, reconciliation, a watchdog and a tamper-evident audit log assembled from events.

## Reading order

| File | What it answers |
|---|---|
| `PRD.md` | Goals, users, MVP scope, every functional and non-functional requirement with id and priority, edge cases, threat model, assumptions, open questions, traceability, acceptance scenarios |
| `ARCHITECTURE.md` | Context and deployable units, repository layout and dependency rules, turn pipeline, money model, ledger and the transfer saga, consistency checks, state ownership and service calls, LLM gateway, security, reliability, observability, scalability, deployment, technology trade-offs, ADR index |
| `DATA_MODEL.md` | Per-service databases: tables, constraints, roles, messaging tables, indexes, Redis keys, retention, seed data |
| `API.md` | The public API (through `edge`): conventions, error codes, routes with owner service, objects, SSE events, mock-rail API |
| `INTERNAL_API.md` | Service-to-service routes, service tokens, the access matrix, internal error codes |
| `EVENTS.md` | Event envelope, broker topology, catalog, producer and consumer rules, guarantees |
| `TESTING.md` | Test layers, required families, OWASP API mapping, evaluation testing, coverage, verification commands, CI, limits of verification |
| `features/F01` to `F10` | Behavior, numbered acceptance criteria, errors, interfaces and tests per feature |
| `IMPLEMENTATION_PLAN.md` | 57 ordered tasks with dependencies, requirement coverage, tests-first lists, done criteria, review points |
| `decisions/ADR-001` to `ADR-019` | Why each significant decision was made, alternatives, consequences (ADR-001 is superseded by ADR-015) |
| `../CLAUDE.md` | Operating rules and task-report format for the implementer |

## Feature specs

| Id | Feature |
|---|---|
| F01 | Authentication in `edge`, roles, access control in every service, PIN and step-up assertion |
| F02 | Conversation and turn pipeline in `assistant`, dialog state, fallback, streaming, transfer notices |
| F03 | Multilingual understanding, parsers, interpreter, recipient resolution |
| F04 | Balance, history, status, navigation, FAQ, tickets |
| F05 | Secure transfer workflow as an orchestrated saga: prepare, confirm, hold, payout, settle or release, reconcile, watchdog |
| F06 | Policy, tools, prompt-injection defenses, redaction, limits |
| F07 | Audit service: events in, hash-chained log, verification, anchors |
| F08 | Evaluation dataset, harness, model comparison, CI gates |
| F09 | Admin console, web client, observability across services, operations |
| F10 | Service platform: shared kit, contracts, messaging, isolation, health |

## Scope in one paragraph

MVP plus an admin console and an observability stack, built as five services: chat in three language forms, balance, history, transfer status, navigation, FAQ and tickets, payouts to saved beneficiaries with confirmation (button with PIN, or exact typed phrase) executed as a saga across `transfers`, `wallet` and a simulated rail with fault injection, reconciliation, a watchdog and manual review, audit assembled from events with an integrity check, an evaluation harness, Prometheus/Grafana/Jaeger dashboards across services, and load, security and system (kill-at-every-step) tests. Real payments, KYC, voice, native apps and multiple currencies are out of scope.

## Assumptions (PRD section 10)

- A1: INR only, integer paise, synthetic users (3 customers, 1 support, 1 admin).
- A2: Node.js 22 and TypeScript strict, Fastify and Zod, React and Vite, Kysely.
- A3: Hosted model is Gemini through an OpenAI-compatible interface; self-hosted model is Qwen3 through Ollama. Both need verification when the gateway is built.
- A4: Structured output plus our own validation instead of native tool calling.
- A5: The Hindi and Hinglish evaluation data is written or reviewed by the owner.
- A6: Docker is available; free-tier staging is a stretch.
- A7: The payment rail is a separate simulated service.
- A8: The desktop PC has an RTX 5060 with 8 GB (confirmed by the owner). Qwen3 4B and 8B at 4-bit are both candidates; fit and speed are measured, not assumed.
- A9: The owner develops on Windows, so all scripts are cross-platform and Docker Desktop is needed.
- A10: A demo in the style of PhonePe or GPay with synthetic money; no real UPI, no copied branding.
- A11: Five services on one Postgres container (five databases with separate credentials), one Redis, one RabbitMQ and one compose network; separate database servers, mutual TLS and a workflow engine are documented scaling steps, not built (ADR-015, ADR-016).

## Decisions made on 2026-10-14

- Q1 (match an existing external API?): No. We design our own clean API. Logic sits behind interfaces, so changing the backend later is a small adapter change.
- Q2 (payout vs wallet-to-wallet?): Keep payout to a saved beneficiary, the "pay a saved contact" flow. It exercises slow, failed and unknown outcomes. Wallet-to-wallet is future work.
- Q3 (can support unmask data?): No. Support sees masked data; only admins can reveal it, with a typed reason that is audited.

## Decision made on 2026-10-15

- D4 (monolith or services?): Five services with a database each (`edge`, `assistant`, `wallet`, `transfers`, `audit`), a RabbitMQ event backbone with transactional outbox and inbox, and the transfer as an orchestrated saga owned by `transfers` with compensation by release. Orchestration for the money path, events for side effects (audit, notices). ADR-015 to ADR-019; ADR-001 is superseded. The plan was rewritten (57 tasks); the first task, T01, was finished before this decision and is reshaped by T02.

## Working method

The project is built in 57 small tasks, one at a time: tests first, then the implementation, then a report. The implementer pauses after every task and waits for the owner's go-ahead; phase checkpoints add a short recap. Details are in `../CLAUDE.md` and `IMPLEMENTATION_PLAN.md`.

## Items still needing the owner

- Approve or change the specs before implementation starts.
- Review the Hindi and Hinglish wording of the catalogs and the evaluation dataset once they exist.
- Provide a free Gemini API key when live evaluation runs begin; none is needed for development or CI.

## Traceability

Every Must and Should requirement in the PRD is listed in the *Covers* line of at least one implementation task. The check `pnpm spec:check` (created in T01, completed in T57) enforces this.
