# ADR-018: Service identity, user tokens and step-up assertions

Status: Proposed (2026-10-15). Amends ADR-010.

## Context

With one process, "who is calling" was answered once at the door. With several services, every service must decide for itself whether a request is allowed, because the network between containers is not a security boundary. We need to answer three questions: which user is this, which service is calling, and was the PIN really checked.

## Decision

**1. User identity: asymmetric access tokens verified by every service.** `edge` signs access tokens (JWT, EdDSA with an Ed25519 key, 900 s) with claims `iss` (`sahayak-edge`), `aud` (`sahayak`), `sub`, `role`, `loc` (preferred locale or null), `iat`, `exp`, `jti`. No personal data. Only `edge` holds the private key; every other service holds only the public key (served at `/.well-known/jwks.json` and pinned by environment configuration in compose), so a compromised service cannot mint tokens. Every service verifies the token itself and applies role and ownership checks itself; `edge` does not vouch for the user on their behalf. Changing the locale preference takes effect in the token at the next refresh (the web app refreshes immediately after the change).

**2. Service identity: short-lived signed service tokens on internal routes.** Internal routes (`/internal/v1/...`) are served on a separate listener that the proxy and `edge` never route to, and they require `X-Service-Token`: a JWT signed with the *calling* service's own Ed25519 key, `iss` = caller, `aud` = callee, 60 s lifetime. The callee holds a data-driven access matrix (`packages/shared/service-acl`, tested) of which caller may call which internal route; anything else is `403`. For calls made on behalf of a user the caller also forwards the user's access token, so ownership checks still use the real `sub`. For background work (saga commands) there is no user token; the command carries the `user_id` and the callee's matrix limits the caller to the specific routes needed.

**3. PIN and step-up.** The PIN and its lockout counters belong to `edge` (identity data). When a confirm request carries a PIN, `edge` verifies it (a wrong PIN returns an error, increments the counter, and never reaches `transfers`) and then attaches `X-Step-Up`: a JWT signed by `edge`, `aud` `transfers`, claims `sub`, `transfer_id`, `snapshot_hash`, `exp` 60 s. `transfers` requires a valid assertion for exactly that user, transfer id and snapshot hash whenever the transfer has `requires_pin`. A stolen assertion is useless for any other transfer or after a minute; replaying it for the same transfer is harmless because confirm is idempotent and only possible while the transfer is `PREPARED`.

**4. Typed confirmation.** The assistant confirms a transfer typed in chat by calling the internal route `POST /internal/v1/transfers/{id}/confirm-typed` with its service token, the user's token and the originating message id. `transfers` accepts this channel only when the transfer does not require a PIN, so even a fully compromised assistant can only confirm a transfer the user has already prepared, below the PIN threshold. The model has no path to this route (ADR-008).

**5. Exposure.** `edge` forwards only an explicit allowlist of public path prefixes. A test requests `/internal/*` through the proxy and expects `404`. Metrics endpoints are on the internal listener too.

**6. Keys.** Private keys come from environment variables only and exist only in the service that owns them. `pnpm keys:generate` writes local development keys to an ignored file; `.env.example` contains none. Key rotation is a documented procedure (JWKS with two keys), not built.

## Alternatives considered

- **Edge validates and forwards trusted headers (`X-User-Id`):** simple, and common behind a mesh, but any service that can reach another can impersonate any user. Rejected.
- **Shared HMAC secret for tokens:** every service could mint tokens. Rejected.
- **Opaque tokens with introspection:** an extra hop on every request, and `edge` becomes a hard dependency of every call.
- **Mutual TLS between services:** the right production answer (often via a mesh); needs certificate management that does not fit a free local setup. Documented as the next step; the service-token matrix already encodes the same policy.
- **PIN verified by `transfers`:** would copy identity data into the money service. Rejected.

## Consequences

- Every service ships a JWT verifier and an access matrix from `platform`; all three are tested once.
- A request needs no call back to `edge`, so `edge` being slow does not slow other services' verification.
- The access matrix doubles as living documentation of who may call whom (`specs/INTERNAL_API.md`).

## Revisit when

Services run on different hosts or networks (add mutual TLS), or token revocation before expiry becomes a requirement (add a short deny list).
