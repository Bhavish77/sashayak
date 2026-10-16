# ADR-012: Testing strategy with real dependencies and scripted models

Status: Proposed (2026-10-14). Amended 2026-10-15 for services: contract tests and system tests added.

## Context

The riskiest bugs here are concurrency, idempotency, and unsafe behavior under adversarial input. Mocked databases and live models cannot catch the first and make the second flaky and costly.

## Decision

- Tests-first workflow for every task (red, green, refactor); tests are never weakened to pass.
- Unit and property tests for pure logic (parsers, ledger, policy, redaction, state machine, canonicalization).
- Integration tests against real Postgres and Redis, including real concurrent commits.
- Reliability suite with fault injection through the mock rail and process kills.
- Contract tests: provider tests prove each service's responses and events match the shared schemas; consumer tests use fakes built from the same schemas; an event-schema snapshot test fails on breaking changes.
- System tests (`pnpm test:system`) against the full compose stack: the transfer saga with each service killed and restarted at each step, broker restart, duplicate and poison messages, and the end-to-end journeys.
- A scripted LLM that implements the same port as real providers; also a "hijacked model" mode that obeys injections, to test worst-case behavior.
- Evaluation harness separate from CI gates: CI gates only on scripted runs; live-model quality is reported, never gated.
- Playwright for user journeys and accessibility checks; k6 for load; coverage thresholds only on the modules where defects are costly.
- Reports never claim a check passed unless it was executed; unexecuted checks are listed as "not run".

## Alternatives considered

- Mocking the database: fast, hides the bugs that matter.
- Gating CI on live model scores: flaky, costly, key-dependent.

## Consequences

Integration tests need Docker or local services; the suite is slower than pure unit tests but trustworthy.

## Revisit when

Test time becomes a bottleneck (parallelize schemas, split suites).
