# API Contract

Status: DRAFT for approval. Revised 2026-10-15 for the service split. This file is the **public** API: base path `/v1`, JSON over HTTPS, reached only through `edge`. Each route is implemented by the service named in its table ("Owner"). Service-to-service routes are in `INTERNAL_API.md` and events in `EVENTS.md`. The Zod schemas in `packages/shared` are the executable form of all three; each service generates OpenAPI for its own routes from them, and a contract test fails on drift (NFR-MAINT-3, NFR-ARCH-2).

## Conventions

- Authentication: `Authorization: Bearer <access token>` on everything except login, refresh, health and OpenAPI. The token is an EdDSA JWT issued by `edge` and verified by every service that serves the route (ADR-018).
- Routing: `edge` forwards only the public prefixes listed below. `/internal/*` is never reachable from outside (a test checks this through the proxy).
- Request id: `edge` accepts `X-Request-Id` (or creates one), forwards it and W3C `traceparent` to services, and every response and error body carries it.
- Errors follow RFC 9457 `application/problem+json`:

```json
{
  "type": "https://sahayak.dev/errors/insufficient-funds",
  "title": "Insufficient funds",
  "status": 422,
  "code": "INSUFFICIENT_FUNDS",
  "detail": "Available balance is lower than the transfer total.",
  "request_id": "01JABCDEF...",
  "errors": []
}
```

- Validation failures use `code: VALIDATION_FAILED` and list field errors in `errors`: `[{ "path": "amount_minor", "message": "must be at least 100" }]`.
- Pagination: `?limit=` (default 20, max 50) and opaque `?cursor=`; responses return `{ "items": [], "next_cursor": null }`.
- Idempotency: `Idempotency-Key` header, 8 to 64 characters from `[A-Za-z0-9_-]`.
- Money: integers in paise (`amount_minor`); currency is the literal `INR`. Formatting is a presentation concern.
- Times: ISO 8601 UTC.
- Rate-limit headers on 429: `Retry-After`, plus `RateLimit-Limit` and `RateLimit-Remaining` on limited routes.
- When a downstream service is unreachable or its breaker is open, `edge` returns `503 DEPENDENCY_UNAVAILABLE` with the service name in `detail`, only for the routes that service owns.

## Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Body, query or header invalid. |
| `AUTH_INVALID_CREDENTIALS` | 401 | Wrong email or password (same message for both). |
| `AUTH_TOKEN_EXPIRED` | 401 | Access token expired. |
| `AUTH_REFRESH_INVALID` | 401 | Refresh token unknown, expired or reused. |
| `AUTH_FORBIDDEN` | 403 | Role lacks access to the route. |
| `NOT_FOUND` | 404 | Missing, or owned by someone else. |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | Header missing on a route that needs it. |
| `IDEMPOTENCY_KEY_REUSED` | 422 | Same key, different request. |
| `IDEMPOTENCY_IN_PROGRESS` | 409 | The first request with this key is still running (after a 5-second wait). |
| `TRANSFER_EXPIRED` | 409 | Prepared transfer is past its expiry. |
| `TRANSFER_NOT_CONFIRMABLE` | 409 | Transfer is not in PREPARED, or the snapshot hash does not match. |
| `TRANSFER_NOT_RESOLVABLE` | 409 | Admin resolve is not allowed for this transfer: not in NEEDS_REVIEW, the outcome is not allowed for where it came from, or the rail answer contradicts the outcome. |
| `TRANSFER_BUSY` | 409 | Admin resolve while a saga command of the transfer holds an active lease; retry shortly. |
| `INSUFFICIENT_FUNDS` | 422 | Not enough available balance at **prepare**. After confirm it appears as `failure_code` on a FAILED transfer instead. |
| `LIMIT_EXCEEDED` | 422 | Per-transfer or daily limit. |
| `PIN_REQUIRED` | 403 | Amount needs the transaction PIN (no valid step-up assertion). |
| `PIN_INVALID` | 403 | Wrong PIN (returned by `edge`). |
| `PIN_LOCKED` | 423 | Too many wrong attempts; `Retry-After` set (returned by `edge`). |
| `RATE_LIMITED` | 429 | Too many requests. |
| `PAYLOAD_TOO_LARGE` | 413 | Body over the size limit. |
| `INTERNAL` | 500 | Unexpected; details only in logs. |
| `DEPENDENCY_UNAVAILABLE` | 503 | A required database or downstream service is unavailable. |

Internal-only codes (`HOLD_VOIDED`, `HOLD_STATE_CONFLICT`, `SERVICE_FORBIDDEN`) are in `INTERNAL_API.md` and are never returned to browsers.

## Authentication and profile (owner: `edge`)

| Method and path | Roles | Description |
|---|---|---|
| `POST /v1/auth/login` | public | Body `{ "email", "password" }`. 200 `{ "access_token", "expires_in": 900, "refresh_token", "user": { "id", "display_name", "role", "preferred_locale" } }`. |
| `POST /v1/auth/refresh` | public | Body `{ "refresh_token" }`. Returns a new pair; the old refresh token is revoked. Reuse revokes the family. The new access token carries the current `loc` claim. |
| `POST /v1/auth/logout` | any | Body `{ "refresh_token" }`. 204. Revokes the family. |
| `GET /v1/me` | any | Current user profile. |
| `PATCH /v1/me` | any | Body `{ "preferred_locale": "en" or "hi" or "hi-Latn" or null }`. Takes effect in tokens at the next refresh; the web app refreshes right after. |
| `PUT /v1/me/pin` | customer | Body `{ "pin", "current_pin": "required if one exists" }`. 204. |

## Conversation (owner: `assistant`)

| Method and path | Roles | Description |
|---|---|---|
| `POST /v1/conversations` | customer | 201 `{ "id", "created_at" }`. |
| `GET /v1/conversations` | customer | Own conversations, newest first. |
| `GET /v1/conversations/:id/messages` | customer | Own messages, oldest first, paginated. Includes `system_notice` messages created from transfer outcome events. |
| `POST /v1/conversations/:id/messages` | customer | Body `{ "text": "1 to 1000 chars", "client_message_id": "uuid, optional" }`. With `Accept: text/event-stream` the reply streams; with `Accept: application/json` the reply is `{ "message": Message }`. |

**Message object**

```json
{
  "id": "uuid",
  "role": "assistant",
  "content": "Aapka available balance ₹12,450.00 hai.",
  "language": "hi-Latn",
  "cards": [{ "type": "balance", "data": { "available_minor": 1245000, "held_minor": 0, "currency": "INR" } }],
  "created_at": "2026-10-14T10:00:00Z"
}
```

Card types: `balance`, `transactions`, `transfer_confirmation`, `transfer_status`, `navigation`, `menu`, `faq`, `ticket`. A `transfer_confirmation` card carries the transfer object (below), so the UI can show Confirm and Cancel and ask for the PIN when `requires_pin` is true. A `navigation` card carries `{ "screen": "<allowlisted id>" }`. Role `system_notice` messages (a transfer reached a final state) are rendered as assistant text with a `transfer_status` card.

**SSE events** (order: `status`*, `card`*, `delta`*, then exactly one `final` or `error`). `edge` passes the stream through unchanged.

```
event: status   data: {"stage":"interpreting"}      (interpreting, executing, responding)
event: card     data: {"type":"balance","data":{...}}
event: delta    data: {"text":"Aapka available ..."}
event: final    data: {Message}
event: error    data: {"code":"INTERNAL","message":"...","request_id":"..."}
```

Behavior: if `client_message_id` was already processed, the original reply is returned (JSON) or replayed as `card`, `delta`, `final` events (SSE). Fallback mode responds with a normal `final` message of card type `menu`.

## Wallet (owner: `wallet`; authoritative APIs, used by the assistant's tools and by the UI in fallback mode)

| Method and path | Roles | Description |
|---|---|---|
| `GET /v1/wallet` | customer | `{ "available_minor", "held_minor", "currency" }`. |
| `GET /v1/transactions` | customer | Query: `from`, `to` (ISO dates), `direction` (`credit` or `debit`), `counterparty` (text), `limit`, `cursor`. Items from `v_transactions` with status COMPLETED, PROCESSING or FAILED. |
| `GET /v1/beneficiaries` | customer | Own beneficiaries: `{ id, display_name, aliases, account_masked }` (aliases are the user's own spellings, used by the recipient resolver; never the account number or `rail_token`). |
| `POST /v1/beneficiaries` | customer | Body `{ "display_name", "aliases": [], "account_number" }`. 201 with the masked account only; the number is never returned or logged. |

## Transfers (owner: `transfers`; authoritative APIs, used by the UI and, through internal routes, by the assistant)

| Method and path | Roles | Description |
|---|---|---|
| `POST /v1/transfers` | customer | Prepare. Body `{ "beneficiary_id", "amount_minor", "currency": "INR", "note": "optional, max 80 chars" }`. 201 Transfer in PREPARED. Errors: `LIMIT_EXCEEDED`, `INSUFFICIENT_FUNDS`, `VALIDATION_FAILED`, `NOT_FOUND`, `DEPENDENCY_UNAVAILABLE` (wallet unreachable). |
| `GET /v1/transfers/:id` | customer | Own transfer. |
| `GET /v1/transfers/by-reference/:reference` | customer | Own transfer by public reference. |
| `GET /v1/transfers` | customer | Own transfers; query `status`, `limit`, `cursor`. |
| `POST /v1/transfers/:id/confirm` | customer | Headers: `Idempotency-Key` (required). Body `{ "snapshot_hash", "pin": "optional" }`. `edge` verifies the PIN when present and forwards a step-up assertion. 202 Transfer in CONFIRMED (the saga continues in the background). Replays return the stored response with header `Idempotent-Replay: true`. Errors: `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_REUSED`, `IDEMPOTENCY_IN_PROGRESS`, `TRANSFER_EXPIRED`, `TRANSFER_NOT_CONFIRMABLE`, `PIN_REQUIRED`, `PIN_INVALID`, `PIN_LOCKED`. |
| `POST /v1/transfers/:id/cancel` | customer | PREPARED only. 200 Transfer in CANCELLED; otherwise `TRANSFER_NOT_CONFIRMABLE`. |

**Transfer object**

```json
{
  "id": "uuid",
  "reference": "TXN-7K3QH2M9XA",
  "status": "PREPARED",
  "amount_minor": 200000,
  "fee_minor": 0,
  "total_minor": 200000,
  "currency": "INR",
  "beneficiary": { "id": "uuid", "display_name": "Rohan Mehta", "account_masked": "XXXX1234" },
  "snapshot_hash": "sha256 hex",
  "requires_pin": true,
  "expires_at": "2026-10-14T10:05:00Z",
  "created_at": "2026-10-14T10:00:00Z",
  "confirmed_at": null,
  "completed_at": null,
  "failure_code": null
}
```

Statuses: PREPARED, CONFIRMED, HOLD_PLACED, SUBMITTED, SETTLING, RELEASING, PENDING_UNKNOWN, NEEDS_REVIEW, COMPLETED, FAILED, CANCELLED, EXPIRED. `failure_code` is one of `INSUFFICIENT_FUNDS`, `HOLD_REJECTED`, `RAIL_REJECTED`, `RAIL_INVALID`, `ADMIN_RESOLVED` (this list is the authoritative enum in `packages/shared`).

Confirm semantics: the idempotency record (in `transfers_db`) is keyed by `(user, "transfer.confirm", Idempotency-Key)` and stores a hash of `transfer id + snapshot_hash`. One local transaction claims the key, locks the transfer row, checks owner, state, expiry (database clock), hash and the step-up assertion when `requires_pin`, sets CONFIRMED, queues the hold command, writes the event and audit rows and stores the response; it does **not** wait for the wallet. A wrong PIN is rejected by `edge` before `transfers` is called, so it does not consume the key. Typed confirmation in chat reaches `transfers` through the internal route with a server-generated key derived from the message id (see `INTERNAL_API.md`).

## Support (owner: `assistant`)

| Method and path | Roles | Description |
|---|---|---|
| `POST /v1/tickets` | customer | Body `{ "conversation_id", "subject": "optional" }`. 201 ticket. Rate limited. |
| `GET /v1/tickets` | customer | Own tickets. |
| `GET /v1/admin/tickets` | support, admin | All tickets, filter by status. |

## Admin

All admin reads of other users' data are audited. Customers receive `AUTH_FORBIDDEN`. `edge` routes by prefix; each owner service enforces roles itself.

| Method and path | Owner | Roles | Description |
|---|---|---|---|
| `GET /v1/admin/conversations` | `assistant` | support, admin | Filter `user_id`, `from`, `to`; paginated. |
| `GET /v1/admin/conversations/:id` | `assistant` | support, admin | Transcript with interpretations and tool calls. Masked. `?unmask=true&reason=...` allowed for admin only; the reason is required and audited. |
| `GET /v1/admin/audit` | `audit` | admin | Filter `actor_id`, `action`, `producer`, `resource_type`, `resource_id`, `from`, `to`; paginated. |
| `GET /v1/admin/audit/verify` | `audit` | admin | Query `from_id`, `to_id`, optional `expected_anchor` (`id:hash`, compared with the chain). 200 `{ "ok": true, "checked": 1200 }` or `{ "ok": false, "first_bad_id": 417, "reason": "hash_mismatch" or "link_mismatch" or "gap" or "anchor_mismatch" }`. |
| `GET /v1/admin/transfers` | `transfers` | admin | Filter `status`, `older_than` (minutes). |
| `GET /v1/admin/transfers/:id` | `transfers` | admin | Transfer with events and saga commands. |
| `POST /v1/admin/transfers/:id/reconcile` | `transfers` | admin | Look the payout up at the rail now; applies the result. |
| `POST /v1/admin/transfers/:id/resolve` | `transfers` | admin | Body `{ "outcome": "COMPLETED" or "FAILED", "reason", "force": false }`; only for NEEDS_REVIEW. Allowed outcomes depend on where the transfer came from, and a payout is looked up at the rail first (rules in `ARCHITECTURE.md` section 6.2 and F05). Moves the transfer to SETTLING or RELEASING; the wallet applies the ledger effect once. Errors: `TRANSFER_NOT_RESOLVABLE`, `TRANSFER_BUSY` (409), `VALIDATION_FAILED`. |
| `GET /v1/admin/llm-calls` | `assistant` | admin | Filter `outcome`, `provider`, `from`, `to`. |
| `PATCH /v1/admin/tickets/:id` | `assistant` | support, admin | Body `{ "status": "open" or "in_progress" or "closed" }`. |
| `POST /v1/admin/evals/runs` | `assistant` | admin | Body `{ kind, dataset_version, provider, model, git_sha, started_at, finished_at, metrics, results: [...] }` (bounded size). Stores one run and its per-case results; this is how the evaluation CLI records results, so no tool needs database credentials. 201 `{ id }`. |
| `GET /v1/admin/evals/runs` and `GET /v1/admin/evals/runs/:id` | `assistant` | admin | Eval runs and per-case results. |
| `GET /v1/admin/evals/compare?runs=a,b` | `assistant` | admin | Side-by-side metrics. |

## Operations

| Path | Notes |
|---|---|
| `GET /v1/openapi.json` | The public contract, generated at build time from the shared route registry and served by `edge`. |
| `GET /.well-known/jwks.json` | Public signing keys for token verification (served by `edge`, fetched by services). |

`/healthz`, `/readyz` and `/metrics` exist on **every** service, including `edge`, but only on the internal listener (never public, never routed by the proxy; see `INTERNAL_API.md`). `edge`'s readiness requires `edge_db`; Redis and RabbitMQ are reported as degraded, not fatal; downstream services are reported in the body but not required. Compose health checks use the internal port.

## Mock rail (separate service, internal network only)

Every request except `/healthz` must carry `X-Rail-Key`, a shared secret from the environment (`RAIL_API_KEY`), compared in constant time; missing or wrong gives 401. The mock rail has no user tokens or service tokens.

| Method and path | Description |
|---|---|
| `POST /payouts` | Body `{ "client_reference", "amount_minor", "currency", "beneficiary_token" }`. Idempotent: the same `client_reference` always returns the original outcome. Returns `{ "payout_id", "client_reference", "status": "COMPLETED" or "REJECTED" or "PENDING" }`. |
| `GET /payouts/by-reference/:client_reference` | Current status, or 404 when unknown. Used by reconciliation. |
| `GET /admin/payouts/count?client_reference=` | Number of payouts that **completed** (moved money) for a reference (test-only; used to prove exactly-once and by the consistency sweep). |
| `POST /admin/faults` | Body `{ "mode": "none" or "latency" or "error_5xx" or "timeout" or "lost_response" or "duplicate_response" or "reject", "probability": 0 to 1, "latency_ms": number }`. Test-only; disabled unless `RAIL_FAULTS_ENABLED=true`. |
| `GET /healthz` | Liveness. |

`lost_response` means the rail performs the payout, records it, and then drops the HTTP response; this is the scenario that produces PENDING_UNKNOWN and proves reconciliation.

## Security notes for implementers

Every route declares allowed roles and request/response schemas; undeclared routes fail startup in tests. Object-level checks live in each owner service's use cases, not only the route. Response schemas are explicit allowlists so internal fields such as `rail_token` or `password_hash` can never be serialized. Unknown JSON properties are rejected. `edge` has an explicit route table; a route that is not in it returns 404 even if a service implements it.
