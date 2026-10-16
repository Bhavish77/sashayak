# ADR-001: Modular monolith with worker and simulated rail

Status: **Superseded by ADR-015 (2026-10-15).** Kept for history: it explains why a monolith was the first choice and which seams (ports, outbox, hold ledger) made the later split affordable.

## Context

The system needs an HTTP API, a background worker for payouts and reconciliation, a stand-in for a partner payment system, and a web client. It will be built by one person with an AI coding assistant and demonstrated on a laptop. Reviewers should see sound boundaries without the overhead of distributed systems that the problem does not need.

## Decision

One codebase, three runtime processes built from it: `api` (HTTP and SSE), `worker` (outbox processor, reconciliation, expiry, audit verification) and a separate `mock-rail` application that simulates the partner. Inside the codebase, business logic lives in pure packages (`core`, `llm`, `shared`) and the apps are thin adapters. Postgres is the only system of record; Redis holds disposable state.

## Alternatives considered

- Microservices per capability (assistant, wallet, notifications): more deployment and consistency problems (distributed transactions for money) and no benefit at this scale.
- A single process with background timers: simpler, but it cannot demonstrate independent scaling of the worker or crash recovery.
- Serverless functions: poor fit for streaming, long-lived workers and local reproducibility.

## Consequences

- Money state changes stay in one database transaction.
- `api` and `worker` are stateless and can be replicated; concurrency safety comes from the database (ADR-007).
- Boundaries are enforced by tooling (ADR-002), not by network calls, so discipline matters.
- Extraction paths (queue service, separate LLM gateway, read replicas) are documented in `ARCHITECTURE.md` section 12 and can be taken later without changing the domain code.

## Revisit when

A second team owns a capability, or the LLM gateway needs independent scaling or keys isolation.
