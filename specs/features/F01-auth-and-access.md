# F01: Authentication and access control (edge service)

Covers: FR-AUTH-1 to FR-AUTH-6, supports FR-SEC-1, FR-AUD-1, NFR-SEC-2, NFR-ARCH-3.

## Problem and outcome

Every action must be attributable to an authenticated user with the right role, users must never reach each other's data, and with several services, **every service must decide for itself** whether a request is allowed (the network between containers is not a security boundary). Outcome: login, short-lived asymmetric access tokens verified by every service, rotating refresh tokens, deny-by-default route policies in each service, object-level checks, a step-up PIN for larger transfers carried as a signed assertion, and audit events for all of it. Design reasoning: ADR-010 (amended) and ADR-018.

## Behavior

**Ownership.** `edge` owns identity: tables `users` and `refresh_tokens` in `edge_db`, the token-signing private key, PIN hashes and PIN lockout counters. No other service stores credentials.

**Login.** `POST /v1/auth/login` checks email and password (argon2id). Success returns an access token and an opaque refresh token (256-bit random, base64url, valid 7 days, stored only as a SHA-256 hash with a `family_id`). The access token is a JWT signed with **EdDSA (Ed25519)**, lifetime 900 seconds, claims `iss` (`sahayak-edge`), `aud` (`sahayak`), `sub`, `role`, `loc` (preferred locale or null), `iat`, `exp`, `jti`; no personal data. Failure returns the same `AUTH_INVALID_CREDENTIALS` for unknown email and wrong password, and performs one password verification in both cases (a dummy hash for unknown emails) so response timing does not reveal which emails exist.

**Throttling.** 5 failed logins per 15 minutes per account and separately per IP, counted in Redis (prefix `edge:`). At the limit the API returns 429 `RATE_LIMITED` with `Retry-After`, including for correct passwords during the lockout. If Redis is unavailable, login throttling fails closed to a per-process counter and reports degraded readiness.

**Refresh.** `POST /v1/auth/refresh` revokes the presented token, issues a new pair in the same family and records `replaced_by`; the new access token carries the current `loc`. Presenting a revoked token revokes the entire family (token-theft signal) and returns `AUTH_REFRESH_INVALID`. Logout revokes the family.

**Verification in every service.** Each service verifies the access token itself with the public key (fetched from `GET /.well-known/jwks.json` at start and pinned by configuration in compose; a service has no private user-token key and cannot mint tokens). Verification checks signature, algorithm (EdDSA only), `iss`, `aud` and `exp`. Services keep verifying with the cached key if `edge` is down.

**Roles and route policies.** Roles: customer, support, admin. In **each** service every route registers a policy `{ roles, ownership }` at definition time. A route without a policy fails that service's startup in test and production. Missing or invalid token gives 401; valid token with the wrong role gives 403. Internal routes use service tokens and the access matrix instead (INTERNAL_API.md), and a test fails if an `/internal` route has no matrix entry.

**Object-level authorization.** Application services receive a `principal` (user id and role from the verified token) and every query on user-owned data filters by `principal.userId`. Foreign objects return 404 with the same body as nonexistent ones. `edge` never vouches for a user on another service's behalf: the user token is forwarded and re-verified.

**Public routing.** `edge` forwards only an explicit allowlist of public path prefixes to the owning service (`API.md`). Anything else, including `/internal/*`, returns 404 at the proxy and at `edge`.

**Transaction PIN.** Customers have an optional PIN (4 to 6 digits, argon2id), set or changed with `PUT /v1/me/pin`. A transfer whose total is at or above `PIN_THRESHOLD_MINOR` (default 200000) requires the PIN at confirm. The PIN is checked **in `edge`**: when the confirm request carries a PIN, `edge` verifies it and, on success, attaches a **step-up assertion** to the forwarded request (JWT signed by `edge`, header `X-Step-Up`, `aud` `transfers`, claims `sub`, `transfer_id`, `snapshot_hash`, `exp` 60 seconds). `transfers` accepts a confirm of a transfer with `requires_pin` only with a valid assertion for exactly that user, transfer and snapshot hash. A wrong PIN is answered by `edge` (`PIN_INVALID`), increments the counter, and never reaches `transfers`; it does not consume the idempotency key. Three wrong attempts set `pin_locked_until` to 15 minutes ahead (`PIN_LOCKED`, HTTP 423, `Retry-After`). A correct PIN resets the counter. While locked, even a correct PIN is rejected. When the browser sends no PIN above the threshold, `edge` forwards without an assertion and `transfers` answers `PIN_REQUIRED`.

**Audit events (published through the outbox, F07):** `auth.login.success`, `auth.login.failure`, `auth.refresh`, `auth.refresh_reuse_detected`, `auth.logout`, `auth.pin.failure`, `auth.pin.locked`, `auth.pin.changed`. Authorization denials are logged and counted by each service that denies them (`authz_denied_total{service}`); a denial that concerns a user action (wrong role for an admin route) also produces `policy.denied`-style audit data in that service's outbox. Details are masked and never contain passwords, PINs or tokens.

## Acceptance criteria

- AC-F01-1: Valid login returns 200 with both tokens; the access token is EdDSA-signed, expires 900 seconds (plus or minus 5) after issue and contains `sub`, `role`, `loc`, `iss`, `aud` but no email or name.
- AC-F01-2: Wrong password and unknown email return byte-identical problem bodies except `request_id`, and both code paths call the password verifier exactly once.
- AC-F01-3: The 6th failed login in 15 minutes for one account returns 429 with `Retry-After`; a correct password during lockout also returns 429; after the window (fake clock) login works.
- AC-F01-4: Refresh returns a new pair; reusing the old refresh token returns `AUTH_REFRESH_INVALID` and also invalidates the new token.
- AC-F01-5: Logout makes the refresh token unusable; the access token expires naturally.
- AC-F01-6: For **each of the five services**, a test enumerates all registered routes and fails if any lacks a policy (public routes) or a matrix entry (internal routes).
- AC-F01-7: Anonymous gets 401 and a customer gets 403 on every admin route; support gets 403 on admin-only routes and 200 on support routes; this is tested directly against the owning service as well as through `edge`.
- AC-F01-8: Customer A reading customer B's transfer, conversation, ticket or message list gets 404 identical to a random id, tested against the owning service directly (bypassing `edge`) with A's valid token.
- AC-F01-9: Confirm above the threshold without a PIN returns `PIN_REQUIRED`; three wrong PINs return `PIN_LOCKED` (423); a correct PIN while locked is rejected; after 15 minutes (fake clock) a correct PIN works and resets the counter.
- AC-F01-10: Each event in the list above produces exactly one `audit.recorded` outbox row in the same transaction as the action, with the expected action and result.
- AC-F01-11: Database inspection shows password and PIN hashes are argon2id and refresh tokens exist only as hashes.
- AC-F01-12: An expired access token returns `AUTH_TOKEN_EXPIRED` at every service; a token with a modified payload or signature, a token signed with another key, a token with the wrong `aud` or `iss`, and a token signed with the HS256 algorithm using the public key as the secret all return 401.
- AC-F01-13: A step-up assertion is accepted only when its signature is `edge`'s, `aud` is `transfers`, `sub` equals the transfer's owner, `transfer_id` and `snapshot_hash` match, and it is unexpired; each deviation returns `PIN_REQUIRED` and changes nothing. An assertion reused for the same transfer after success is harmless (idempotent replay).
- AC-F01-14: Key separation: only `edge` has the user-token private key and the step-up key in its environment; a test starts each other service with a configuration check that fails if either private key variable is set; a service token signed by one service is rejected when it claims another service's name.
- AC-F01-15: With `edge` stopped, the other services keep accepting valid access tokens (cached public key) on their own routes.
- AC-F01-16: Requests to `/internal/...` through the proxy and through `edge` return 404; a request to an internal listener without a valid service token returns 401 `SERVICE_TOKEN_INVALID`, and with a valid token for a route outside the caller's matrix row returns 403 `SERVICE_FORBIDDEN`.
- AC-F01-17: Changing `preferred_locale` takes effect in the `loc` claim after the next refresh, and the web client refreshes immediately after the change.

## Errors and security

Codes in `API.md` and `INTERNAL_API.md`. Secrets (the Ed25519 private keys, 32 random bytes of seed material) come from the environment; startup fails if missing or malformed. `pnpm keys:generate` writes development keys to an ignored file. Passwords and PINs are never logged and never forwarded past `edge`. CORS allows only configured origins at `edge`. Account enumeration is prevented on login; the PIN endpoint reveals only lock state for the authenticated user.

## Interfaces and dependencies

`edge_db` tables `users`, `refresh_tokens`, `event_outbox`; Redis `edge:login:fail:*`; ports in `edge`: `Clock`, `PasswordHasher`, `TokenSigner`, `StepUpSigner`, `AuditEvents`; shared from `packages/platform`: `TokenVerifier`, `ServiceTokenSigner`, `ServiceTokenVerifier`, `AccessMatrix`, route policy helper (F10); routes in `API.md` "Authentication" and `INTERNAL_API.md`.

## Tests required

Unit: token claims, hasher wrapper, PIN counter logic with fake clock, policy declaration helper, assertion builder and verifier, JWT algorithm confusion cases. Integration: all acceptance criteria against real Postgres and Redis, per service. Contract: the assertion and service-token claims schemas. Security suite: authorization matrix (AC-F01-6 to 8), enumeration and timing-path test, key separation (AC-F01-14), internal exposure (AC-F01-16). Regression test added for any defect found.
