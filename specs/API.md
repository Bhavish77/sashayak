# API Contract

Status: DRAFT for approval. Base path `/v1`. JSON over HTTPS. The Zod schemas in `packages/shared` are the executable form of this document; OpenAPI is generated from them and a contract test fails on drift (NFR-MAINT-3).

## Conventions

- Authentication: `Authorization: Bearer <access token>` on everything except login, refresh, health and OpenAPI.
- Request id: the server accepts `X-Request-Id` (or creates one) and returns it on every response and in every error body.
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
| `INSUFFICIENT_FUNDS` | 422 | Not enough available balance. |
| `LIMIT_EXCEEDED` | 422 | Per-transfer or daily limit. |
| `PIN_REQUIRED` | 403 | Amount needs the transaction PIN. |
| `PIN_INVALID` | 403 | Wrong PIN. |
| `PIN_LOCKED` | 423 | Too many wrong attempts; `Retry-After` set. |
| `RATE_LIMITED` | 429 | Too many requests. |
| `PAYLOAD_TOO_LARGE` | 413 | Body over the size limit. |
| `INTERNAL` | 500 | Unexpected; details only in logs. |
| `DEPENDENCY_UNAVAILABLE` | 503 | Database unavailable. |

## Authentication

| Method and path | Roles | Description |
|---|---|---|
| `POST /v1/auth/login` | public | Body `{ "email", "password" }`. 200 `{ "access_token", "expires_in": 900, "refresh_token", "user": { "id", "display_name", "role", "preferred_locale" } }`. |
| `POST /v1/auth/refresh` | public | Body `{ "refresh_token" }`. Returns a new pair; the old refresh token is revoked. Reuse revokes the family. |
| `POST /v1/auth/logout` | any | Body `{ "refresh_token" }`. 204. Revokes the family. |
| `GET /v1/me` | any | Current user profile. |
| `PATCH /v1/me` | any | Body `{ "preferred_locale": "en" or "hi" or "hi-Latn" or null }`. |

## Conversation

| Method and path | Roles | Description |
|---|---|---|
| `POST /v1/conversations` | customer | 201 `{ "id", "created_at" }`. |
| `GET /v1/conversations` | customer | Own conversations, newest first. |
| `GET /v1/conversations/:id/messages` | customer | Own messages, oldest first, paginated. |
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

Card types: `balance`, `transactions`, `transfer_confirmation`, `transfer_status`, `navigation`, `menu`, `faq`, `ticket`. A `transfer_confirmation` card carries the transfer object (below), so the UI can show Confirm and Cancel and ask for the PIN when `requires_pin` is true. A `navigation` card carries `{ "screen": "<allowlisted id>" }`.

**SSE events** (order: `status`*, `card`*, `delta`*, then exactly one `final` or `error`)

```
event: status   data: {"stage":"interpreting"}      (interpreting, executing, responding)
event: card     data: {"type":"balance","data":{...}}
event: delta    data: {"text":"Aapka available ..."}
event: final    data: {Message}
event: error    data: {"code":"INTERNAL","message":"...","request_id":"..."}
```

Behavior: if `client_message_id` was already processed, the original reply is returned (JSON) or replayed as `card`, `delta`, `final` events (SSE). Fallback mode responds with a normal `final` message of card type `menu`.

## Wallet and transfers (authoritative APIs, used by tools and by the UI in fallback mode)

| Method and path | Roles | Description |
|---|---|---|
| `GET /v1/wallet` | customer | `{ "available_minor", "held_minor", "currency" }`. |
| `GET /v1/transactions` | customer | Query: `from`, `to` (ISO dates), `direction` (`credit` or `debit`), `counterparty` (text), `limit`, `cursor`. Items from `v_transactions`. |
| `GET /v1/beneficiaries` | customer | Own beneficiaries (display name, masked account). |
| `POST /v1/transfers` | customer | Prepare. Body `{ "beneficiary_id", "amount_minor", "currency": "INR", "note": "optional, max 80 chars" }`. 201 Transfer in PREPARED. Errors: `LIMIT_EXCEEDED`, `INSUFFICIENT_FUNDS`, `VALIDATION_FAILED`, `NOT_FOUND`. |
| `GET /v1/transfers/:id` | customer | Own transfer. |
| `GET /v1/transfers/by-reference/:reference` | customer | Own transfer by public reference. |
| `GET /v1/transfers` | customer | Own transfers; query `status`, `limit`, `cursor`. |
| `POST /v1/transfers/:id/confirm` | customer | Headers: `Idempotency-Key` (required). Body `{ "snapshot_hash", "pin": "optional" }`. 202 Transfer in CONFIRMED. Replays return the stored response with header `Idempotent-Replay: true`. Errors: `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_REUSED`, `IDEMPOTENCY_IN_PROGRESS`, `TRANSFER_EXPIRED`, `TRANSFER_NOT_CONFIRMABLE`, `INSUFFICIENT_FUNDS`, `PIN_REQUIRED`, `PIN_INVALID`, `PIN_LOCKED`. |
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

Confirm semantics: the idempotency record is keyed by `(user, "transfer.confirm", Idempotency-Key)` and stores a hash of `transfer id + snapshot_hash`. The transaction locks the wallet row, re-checks funds, writes HOLD, sets CONFIRMED, writes the event and the outbox row, and stores the response, all or nothing. A wrong PIN does not consume the key. Typed confirmation in chat reaches the same service with a server-generated key derived from the message id.

## Support

| Method and path | Roles | Description |
|---|---|---|
| `POST /v1/tickets` | customer | Body `{ "conversation_id", "subject": "optional" }`. 201 ticket. Rate limited. |
| `GET /v1/tickets` | customer | Own tickets. |
| `GET /v1/admin/tickets` | support, admin | All tickets, filter by status. |

## Admin

All admin reads of other users' data are audited. Customers receive `AUTH_FORBIDDEN`.

| Method and path | Roles | Description |
|---|---|---|
| `GET /v1/admin/conversations` | support, admin | Filter `user_id`, `from`, `to`; paginated. |
| `GET /v1/admin/conversations/:id` | support, admin | Transcript with interpretations and tool calls. Masked. `?unmask=true&reason=...` allowed for admin only; the reason is required and audited. |
| `GET /v1/admin/audit` | admin | Filter `actor_id`, `action`, `resource_type`, `from`, `to`; paginated. |
| `GET /v1/admin/audit/verify` | admin | Query `from_id`, `to_id`. 200 `{ "ok": true, "checked": 1200 }` or `{ "ok": false, "first_bad_id": 417 }`. |
| `GET /v1/admin/transfers` | admin | Filter `status`, `older_than` (minutes). |
| `POST /v1/admin/transfers/:id/reconcile` | admin | Look the payout up at the rail now; applies the result. |
| `POST /v1/admin/transfers/:id/resolve` | admin | Body `{ "outcome": "COMPLETED" or "FAILED", "reason" }`; only for NEEDS_REVIEW. |
| `GET /v1/admin/llm-calls` | admin | Filter `outcome`, `provider`, `from`, `to`. |
| `GET /v1/admin/evals/runs` and `GET /v1/admin/evals/runs/:id` | admin | Eval runs and per-case results. |
| `GET /v1/admin/evals/compare?runs=a,b` | admin | Side-by-side metrics. |

## Operations

| Path | Notes |
|---|---|
| `GET /healthz` | Liveness: process is up. |
| `GET /readyz` | Readiness: Postgres required; Redis reported as degraded, not fatal. 503 when not ready. |
| `GET /metrics` | Prometheus text; served on an internal port or protected by a token, not public. |
| `GET /v1/openapi.json` | Generated contract. |

## Mock rail (separate service, internal network only)

| Method and path | Description |
|---|---|
| `POST /payouts` | Body `{ "client_reference", "amount_minor", "currency", "beneficiary_token" }`. Idempotent: the same `client_reference` always returns the original outcome. Returns `{ "payout_id", "client_reference", "status": "COMPLETED" or "REJECTED" or "PENDING" }`. |
| `GET /payouts/by-reference/:client_reference` | Current status, or 404 when unknown. Used by reconciliation. |
| `POST /admin/faults` | Body `{ "mode": "none" or "latency" or "error_5xx" or "timeout" or "lost_response" or "duplicate_response" or "reject", "probability": 0 to 1, "latency_ms": number }`. Test-only; disabled unless `RAIL_FAULTS_ENABLED=true`. |
| `GET /healthz` | Liveness. |

`lost_response` means the rail performs the payout, records it, and then drops the HTTP response; this is the scenario that produces PENDING_UNKNOWN and proves reconciliation.

## Security notes for implementers

Every route declares allowed roles and request/response schemas; undeclared routes fail startup in tests. Object-level checks live in the application service, not only the route. Response schemas are explicit allowlists so internal fields such as `rail_token` or `password_hash` can never be serialized. Unknown JSON properties are rejected.
