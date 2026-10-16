# ADR-002: Node.js, TypeScript, Fastify, Zod and a pnpm monorepo with enforced boundaries

Status: Proposed (2026-10-14). Amended 2026-10-15 for the service split (ADR-015): workspace layout and boundary rules below.

## Context

The team wants one language across the API, worker and web client, and the owner chose Fastify with Zod. The project must demonstrate maintainability, not just features.

## Decision

- Node.js 22 LTS and TypeScript in strict mode everywhere, including the web app.
- Fastify with a Zod type provider for routing and validation; the same Zod schemas in `packages/shared` define request and response types, the interpretation schema and the OpenAPI document.
- Kysely over `pg` for typed SQL; plain SQL migrations.
- pnpm workspaces: apps `edge`, `assistant`, `wallet`, `transfers`, `audit`, `mock-rail`, `web`; packages `shared` (contracts and pure utilities), `platform` (infrastructure kit: service skeleton, config, logging, database, Redis, messaging, breakers, service security; no business logic), `assistant-core` (pure assistant domain logic, also used by the evaluation CLI), `llm` (model gateway), `evals`.
- dependency-cruiser rules: `shared` imports nothing internal; `platform` and `assistant-core` import `shared` only; `llm` imports `shared` and `platform`; apps import packages, **never each other**; packages never import apps; no cycles. CI fails on violations.
- Business logic depends on ports (interfaces) and receives adapters by injection, so Fastify is replaceable.

## Alternatives considered

- Express: more familiar, but validation and typing are bolt-ons.
- NestJS: heavier conventions; hides the structure a reviewer should see.
- Hono: attractive and small, but a less established ecosystem for this kind of service.
- An ORM (Prisma, Drizzle): money paths need explicit locks and statements; typed SQL keeps them visible.
- Python/FastAPI: capable, but would split the stack across two languages (API in Python, web client in TypeScript).

## Consequences

One language and one schema source across API, worker, UI and evals. Slightly more wiring than a framework with batteries included. The boundary rules are part of the test suite (`pnpm arch`).

## Revisit when

A team standard conflicts (for example NestJS is mandated); only each service's adapter layer and the `platform` service skeleton change.
