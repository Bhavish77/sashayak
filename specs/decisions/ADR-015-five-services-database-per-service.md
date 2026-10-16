# ADR-015: Five services with a database per service

Status: Proposed (2026-10-15). Supersedes ADR-001.

## Context

ADR-001 chose a modular monolith because one person builds this on a laptop. The owner decided on 2026-10-15 to build it as services instead, for two reasons: real wallet and payment platforms are built this way, and the project sets out to demonstrate how consistency is kept when a business operation spans several databases. The cost is accepted knowingly: more infrastructure, more tasks, eventual consistency, and harder debugging.

## Decision

Five application services, one simulated partner, one web app, and three infrastructure pieces:

| Service | Owns (its own database) | Does | Does not do |
|---|---|---|---|
| `edge` | users, credentials, refresh tokens, PIN state | The only public entry point: TLS-terminated traffic arrives through the proxy; CORS, headers, size and IP rate limits, login and tokens, PIN check and step-up assertions, routing of public routes to the services, SSE pass-through | Business logic of any other service |
| `assistant` | conversations, messages, tool invocations, LLM calls, knowledge base, tickets, evaluation results | Chat turns: understanding, policy, tools, templates, FAQ, fallback mode, admin inspection of conversations | Touch money tables; confirm transfers by model output |
| `wallet` | wallets, holds, ledger, beneficiaries | The only writer of balances. Balance and history reads. Idempotent hold, settle and release commands | Know why a hold was requested; talk to the rail |
| `transfers` | transfers, events, idempotency keys, saga command queue | The transfer state machine and the saga orchestrator; limits; snapshot; confirm; rail adapter; reconciliation; expiry | Change a balance directly |
| `audit` | the hash-chained audit log | Ingest audit events from all services, chain them, verify them, serve the admin audit view | Take part in any business transaction |
| `mock-rail` | in-memory payouts | Simulated external partner with fault injection | |
| `web` | nothing | React client; talks to `edge` only | |

Infrastructure: one Postgres 16 container with **five databases** (one per service, each with its own migrator, application and read-only roles; an application role can connect only to its own database), Redis 7 (rate limits, dialog state, breaker state; disposable), RabbitMQ (events), a reverse proxy in front of `edge` replicas.

Rules that make this microservices and not a distributed monolith (each is enforced by a test or a lint rule, see NFR-ARCH-1 and NFR-ARCH-2):

1. **A service owns its data.** No service reads or writes another service's database. Credentials make it impossible, and a test proves it.
2. **Services talk only through versioned contracts** defined as Zod schemas in `packages/shared`: HTTP for queries and commands, RabbitMQ events for facts (ADR-017).
3. **Apps never import each other.** They may import `shared` (contracts and pure utilities) and `platform` (infrastructure kit with no business logic). `dependency-cruiser` fails the build otherwise.
4. **No remote call inside a database transaction.** A transaction commits local state and an outbox row; a worker performs the call afterwards.
5. **At most three synchronous hops** on any request path (for example `edge` to `assistant` to `transfers` to `wallet`), each with a smaller timeout than its caller.
6. **Each service can start and be tested alone**, with collaborators replaced by contract fakes built from the same schemas.

Why these boundaries:

- `wallet` and `transfers` are separate because they have different jobs and different reasons to change. The wallet is a small, strict resource manager (balances and holds that cannot go wrong). Transfers is a workflow coordinator (limits, partner, retries, human review). This is the classic split between a ledger and a payments orchestrator.
- `assistant` is separate because it is the part with a different failure and scaling profile (slow, costly, model-bound, AI risk). Keeping it away from money tables means a manipulated model has no database path to money, only the same API a user has.
- `edge` concentrates exposure and identity in one place.
- `audit` is separate so that a compromised business service cannot rewrite the evidence about itself.

## Alternatives considered

- **Keep the modular monolith** (ADR-001): lowest risk and fastest, and still defensible. Not chosen because the project's purpose is to demonstrate distributed consistency. The monolith's seams (ports, outbox, hold ledger) are what make this split affordable.
- **More services** (identity, notification, beneficiaries, a separate rail adapter): each adds coordination cost with no new lesson. Identity stays a module inside `edge`; the rail adapter stays inside `transfers`. Both are separated by directory and lint rules, so a later split is mechanical.
- **Fewer services** (merge `wallet` into `transfers`): removes the interesting distributed transaction; the "saga" would collapse into one local transaction.
- **One shared database with a schema per service**: easy, and exactly how a distributed monolith starts. Rejected.
- **Serverless functions**: poor fit for streaming, long-lived workers and local reproducibility.

## Consequences

- A business operation that used to be one transaction (confirm: hold, ledger, state, outbox) becomes a saga (ADR-016).
- Reads that used to join across domains now call another service or use data copied into a snapshot (for example the beneficiary name copied into the transfer snapshot).
- 57 tasks instead of 44; about ten containers in the base stack; a shared `platform` package that must stay free of business logic.
- Local debugging relies on request ids and trace ids that cross services (NFR-OBS-3), and on one command that starts everything.
- Each service has `api` and `worker` roles in the same image (`SERVICE_ROLES`), so a worker can be scaled separately.

## Revisit when

The `wallet` and `transfers` split causes more coordination than it removes, or when one service needs a different runtime or team.
