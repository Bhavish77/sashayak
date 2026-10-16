# Internal API (service to service)

Status: DRAFT for approval. New 2026-10-15 (ADR-015, ADR-018). These routes are used only between services. They are served on each service's **internal listener** (`INTERNAL_PORT`, on the private compose network), are never routed by the proxy or by `edge`, and are not part of the public contract in `API.md`. Zod schemas are in `packages/shared`; a provider test in the owner service and a consumer test in each caller use the same schemas (NFR-ARCH-2).

## Conventions

- **Identity.** Every request to `/internal/*` carries `X-Service-Token`: a JWT signed with the caller's Ed25519 key, `iss` = caller name, `aud` = callee name, lifetime 60 seconds, unique `jti`. The callee remembers the `jti` values it has seen for 60 seconds and rejects a repeat (per process: best-effort replay protection; mutual TLS is the production answer). The callee checks the signature (caller public keys come from configuration), audience and expiry, then checks the **access matrix** below. A valid token for a route the caller may not use returns `403 SERVICE_FORBIDDEN`; an invalid token returns `401 SERVICE_TOKEN_INVALID`.
- **User context.** When a call is made on behalf of a user, the caller also forwards `Authorization: Bearer <user access token>`; the callee verifies it and applies the same ownership rules as for the public routes. Background calls (saga commands) carry no user token; the body names the `user_id` and the access matrix limits what the caller can do.
- **Tracing.** `X-Request-Id` and W3C `traceparent` are forwarded on every call.
- **Errors.** `application/problem+json` as in `API.md`, with the internal codes in the table at the end.
- **Idempotency.** Commands are idempotent by natural key (the transfer id), not by header. Repeating a command returns the current state.
- **Timeouts and retries** (caller side, from `platform`): 3 s per call to a service that makes no further calls (`wallet`); 5 s for `assistant` to `transfers`, because `transfers` calls `wallet` while serving the request; reads retried once with jitter; commands are not retried inline because the durable saga queue retries them. A circuit breaker per callee (5 consecutive failures opens it for 30 s).
- **Health.** Every service serves `GET /healthz`, `GET /readyz` and `GET /metrics` on its internal listener without a service token (private network only).

## Access matrix

| Callee | Route | Allowed callers | Notes |
|---|---|---|---|
| `wallet` | `POST /internal/v1/holds` | `transfers` | Saga step 1 |
| `wallet` | `POST /internal/v1/holds/:transfer_id/settle` | `transfers` | Saga step 3a |
| `wallet` | `POST /internal/v1/holds/:transfer_id/release` | `transfers` | Saga step 3b (compensation) |
| `wallet` | `GET /internal/v1/wallets/:user_id/balance` | `transfers` | Prepare pre-check |
| `wallet` | `GET /internal/v1/beneficiaries/:id?user_id=` | `transfers` | Prepare; returns `rail_token` |
| `transfers` | `POST /internal/v1/transfers` | `assistant` | Prepare with `origin_conversation_id`; user token required |
| `transfers` | `POST /internal/v1/transfers/:id/confirm-typed` | `assistant` | Typed confirmation; user token required; refused when `requires_pin` |
| `edge`, `assistant`, `wallet`, `transfers`, `audit` | `GET /healthz`, `/readyz`, `/metrics` | any on the private network | No token |

The public routes that the assistant calls as the user (`GET /v1/wallet`, `GET /v1/transactions`, `GET /v1/beneficiaries`, `GET /v1/transfers...`, `POST /v1/transfers/:id/cancel`) are the same routes the browser uses, authorized by the forwarded user token; they need no service token. The matrix lives as data in `packages/shared/service-acl` and a test fails if a route is registered under `/internal` without an entry.

## Wallet routes

**`POST /internal/v1/holds`** (saga step 1)

Request: `{ "transfer_id", "user_id", "amount_minor", "currency": "INR", "reference", "counterparty_name", "note": null }`. `amount_minor` is the transfer's **total** (amount plus fee); settle and release must send the same value.

| Situation | Response |
|---|---|
| No hold yet and funds suffice | 201 `{ "transfer_id", "state": "HELD", "available_minor", "held_minor" }` |
| Hold already exists as `HELD`, `SETTLED` or `RELEASED` | 200 `{ "transfer_id", "state": "<current>" }`; nothing changes |
| No hold yet and funds do not suffice | 422 `INSUFFICIENT_FUNDS`; the hold is recorded as `REJECTED` (no ledger entry) |
| Hold already exists as `REJECTED` | 422 `INSUFFICIENT_FUNDS` again, so a lost response or a duplicate command gets the same answer |
| Hold was voided (a release arrived first) | 409 `HOLD_VOIDED` |
| Wallet of `user_id` unknown | 404 `NOT_FOUND` |

**`POST /internal/v1/holds/:transfer_id/settle`** (saga step 3a). Request: `{ "amount_minor" }`.

| Situation | Response |
|---|---|
| HELD | 200 `{ "state": "SETTLED" }`; SETTLE entry, `held -= amount` |
| Already SETTLED | 200 `{ "state": "SETTLED" }`; nothing changes |
| RELEASED, REJECTED, VOIDED or no hold | 409 `HOLD_STATE_CONFLICT` |
| Amount differs from the hold | 409 `HOLD_STATE_CONFLICT` |

**`POST /internal/v1/holds/:transfer_id/release`** (saga step 3b, compensation). Request: `{ "user_id", "amount_minor" }`.

| Situation | Response |
|---|---|
| HELD | 200 `{ "state": "RELEASED" }`; RELEASE entry, `held -= amount`, `available += amount` |
| Already RELEASED, REJECTED or VOIDED | 200 with the current state; nothing changes |
| No hold | 200 `{ "state": "VOIDED" }`; a tombstone is written so a late hold command is refused |
| SETTLED | 409 `HOLD_STATE_CONFLICT` |

**`GET /internal/v1/wallets/:user_id/balance`** returns `{ "available_minor", "held_minor", "currency" }`.

**`GET /internal/v1/beneficiaries/:id?user_id=`** returns `{ "id", "display_name", "account_masked", "rail_token" }` when the beneficiary belongs to `user_id`, otherwise 404.

All wallet commands run in one local transaction that locks the wallet row, writes the ledger entry and the hold row, and inserts the audit event; none calls another service.

## Transfers routes

**`POST /internal/v1/transfers`**: same request and response as the public `POST /v1/transfers`, plus the optional `origin_conversation_id`. Requires the user token (the transfer belongs to its `sub`). The public route does not accept `origin_conversation_id` (unknown properties are rejected), so a browser cannot attach a transfer to someone else's conversation.

**`POST /internal/v1/transfers/:id/confirm-typed`**: request `{ "message_id", "snapshot_hash" }`. Requires the user token. `transfers` derives the idempotency key `typed:{message_id}` and runs the same confirm path as the public route, with these differences: no step-up assertion is needed, and the request is refused with `403 PIN_REQUIRED` when the transfer has `requires_pin`. Response: 202 Transfer in CONFIRMED, as for the public route.

## Internal error codes

| Code | HTTP | Meaning |
|---|---|---|
| `SERVICE_TOKEN_INVALID` | 401 | Missing, malformed, expired or wrongly signed service token. |
| `SERVICE_FORBIDDEN` | 403 | The caller is not allowed to call this route. |
| `HOLD_VOIDED` | 409 | A release arrived first and voided the hold; the saga must not place it. |
| `HOLD_STATE_CONFLICT` | 409 | The command contradicts the hold's state (for example settle after release); this is a defect signal and raises an alert. |

`INSUFFICIENT_FUNDS`, `NOT_FOUND`, `VALIDATION_FAILED` and `PIN_REQUIRED` keep the meanings in `API.md`.
