# ADR-014: Resilience patterns used and deliberately not used

Status: Proposed (2026-10-15). Revised the same day for the service split (ADR-015).

## Context

The system depends on two unreliable external parties (the language model provider and the payment rail), on infrastructure (Postgres, Redis, RabbitMQ), and now on calls between its own services. Resilience patterns are tools for specific failure modes. Adding all of them regardless of need would add complexity without adding safety.

## Decision: patterns used, and the failure each one addresses

- **Timeouts on every network call**, with each hop's timeout smaller than its caller's (LLM 15 s; rail 5 s; `assistant` to `transfers` 5 s; calls to a leaf service such as `wallet` 3 s; `edge` to a service 10 s, except streams): a slow dependency must not hold requests or workers forever.
- **Retries with exponential backoff and jitter, only on idempotent operations** (LLM 2 retries on 429 and 5xx; rail up to 3 attempts with the same client reference; saga commands retried durably from the command queue; synchronous service reads retried once): transient errors, without creating duplicate payouts or retry storms.
- **Circuit breaker per downstream**, one reusable component (`platform`), state shared through Redis (opens after 5 consecutive failures for 30 s, then one probe): around the LLM (fail fast to the fallback menu), around the payment rail (no retry attempts consumed while open, holds stay), and around each service-to-service client (`assistant` to `wallet` and `transfers`, `transfers` to `wallet`). Losing Redis makes breakers act as closed.
- **Concurrency limit (bulkhead) and load shedding for LLM calls** (20 in flight per replica, 2 s wait for a slot, then the fallback menu): a slow model cannot exhaust the `assistant` or slow money operations. Separate services are also a bulkhead: when `assistant` is down, the wallet and transfer APIs keep working through the UI's fallback mode.
- **Graceful degradation**: the fallback menu keeps the product usable when the model or the whole `assistant` is down.
- **Idempotency keys, idempotent saga commands, transactional outbox, inbox and reconciliation**: duplicates, crashes, lost responses and lost or duplicated messages.
- **Saga watchdog and dead-letter queues**: work stuck between steps or poisoned messages is found and alerted, not silently dropped.
- **Health and readiness checks per service, graceful shutdown, rate limits and request size limits**: safe deployments and protection from overload and abuse.

## Decision: patterns considered and not used

- **Service mesh and sidecar retries (Istio, Linkerd):** there are five services on one host. The same policies (timeouts, retries, breakers, access matrix) are implemented once in the `platform` library and are visible in code and tests. A mesh is the production answer when many teams and runtimes are involved.
- **A commercial or off-the-shelf API gateway (Kong, Envoy, AWS API Gateway):** `edge` is our gateway, so the routing, token and rate-limit logic are explicit and testable; the reverse proxy in compose only load-balances `edge` replicas.
- **Service discovery and client-side load balancing:** compose DNS names and the proxy cover the demo; a platform load balancer or Kubernetes services cover production.
- **A workflow engine (Temporal, Camunda) in place of the hand-built saga:** see ADR-016.
- **Two-phase commit across services:** unsupported by the partner and not worth it between our own services; replaced by the saga.
- **Hedged or speculative requests:** they risk duplicate payouts and double model cost.
- **Retry budgets and adaptive concurrency limits:** worthwhile at much higher traffic; without measurements they only add moving parts. Revisit with load-test data.
- **A chaos-engineering platform:** the mock rail's fault modes, the process-kill tests and the compose-level kill tests of each service exercise the same failures deliberately and repeatably.
- **Deadline propagation headers:** the decreasing per-hop timeouts approximate it for a path of at most three hops; a header would be added if paths got longer.

## Consequences

- Each resilience pattern in the code has a named failure it prevents and a test that triggers that failure.
- A short, honest answer to "why no X?" exists for each pattern we skipped.
- All of the policy lives in one library, so a mistake is fixed once, and a service that forgets to use it is caught by the contract and architecture tests.

## Revisit when

Services run on several hosts or are owned by several teams (adopt a mesh), traffic grows enough for adaptive limits to matter, or load tests show a dependency starving another.
