# ADR-009: Hash-chained, insert-only audit log

Status: Proposed (2026-10-14).

## Context

Operators and auditors need to know who did what. Silent edits to history, by a bug or a compromised account, must at least be detectable.

## Decision

`audit_log` is insert-only for the application role (no UPDATE, DELETE, TRUNCATE; triggers also block them). Each row stores `prev_hash` and `hash = sha256(prev_hash || canonical_json(row))`. Inserts take an advisory lock so the chain has one order and happen in the same transaction as the action. A verifier walks ranges and reports the first bad id; it runs hourly and on demand. The worker writes the latest hash as an external anchor line hourly and at shutdown.

## Alternatives considered

- Plain table with logging only: no integrity evidence.
- External append-only store or ledger database: stronger, costs money and complexity; mentioned as a production option.
- Per-row signatures with a key: needs key management; a hash chain is enough to show tampering in the demo.

## Consequences

Tamper-evident, not tamper-proof: a database owner can rebuild the chain, which is why anchors exist and why the documentation states this limit. Inserts are serialized by the lock; the scaling path is a chain per day with daily anchors.

## Revisit when

Audit throughput exceeds a few hundred writes per second or regulatory retention is required.
