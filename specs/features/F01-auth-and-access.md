# F01: Authentication and access control

Covers: FR-AUTH-1 to FR-AUTH-6, supports FR-SEC-1, FR-AUD-1, NFR-SEC-2.

## Problem and outcome

Every action must be attributable to an authenticated user with the right role, and users must never reach each other's data. Outcome: login, short-lived access tokens, rotating refresh tokens, deny-by-default route policies, object-level checks, a step-up PIN for larger transfers, and audit trails for all of it.

## Behavior

**Login.** `POST /v1/auth/login` checks email and password (argon2id). Success returns an access token (JWT, 900 seconds, claims `sub`, `role`, `iat`, `exp`, `jti`, no personal data) and an opaque refresh token (256-bit random, base64url, valid 7 days, stored only as a SHA-256 hash with a `family_id`). Failure returns the same `AUTH_INVALID_CREDENTIALS` for unknown email and wrong password, and performs one password verification in both cases (a dummy hash for unknown emails) so response timing does not reveal which emails exist.

**Throttling.** 5 failed logins per 15 minutes per account and separately per IP, counted in Redis. At the limit the API returns 429 `RATE_LIMITED` with `Retry-After`, including for correct passwords during the lockout. If Redis is unavailable, login throttling fails closed to a per-process counter and reports degraded readiness.

**Refresh.** `POST /v1/auth/refresh` revokes the presented token, issues a new pair in the same family and records `replaced_by`. Presenting a revoked token revokes the entire family (token-theft signal) and returns `AUTH_REFRESH_INVALID`. Logout revokes the family.

**Roles and route policies.** Roles: customer, support, admin. Every route registers a policy `{ roles, ownership }` at definition time. A route without a policy fails application startup in test and production. Missing or invalid token gives 401; valid token with the wrong role gives 403.

**Object-level authorization.** Application services receive a `principal` (user id and role) and every query on user-owned data filters by `principal.userId`. Foreign objects return 404 with the same body as nonexistent ones.

**Transaction PIN.** Customers have an optional PIN (4 to 6 digits, argon2id). A transfer whose total is at or above `PIN_THRESHOLD_MINOR` (default 200000) requires the PIN at confirm. Three wrong attempts set `pin_locked_until` to 15 minutes ahead (`PIN_LOCKED`, HTTP 423, `Retry-After`). A correct PIN resets the counter. While locked, even a correct PIN is rejected.

**Audit events written by this feature:** `LOGIN_SUCCESS`, `LOGIN_FAILURE`, `TOKEN_REFRESH`, `TOKEN_REUSE_DETECTED`, `LOGOUT`, `PIN_FAILED`, `PIN_LOCKED`, `AUTHZ_DENIED`. Details are masked and never contain passwords, PINs or tokens.

## Acceptance criteria

- AC-F01-1: Valid login returns 200 with both tokens; the access token expires 900 seconds (plus or minus 5) after issue and contains `sub` and `role` but no email or name.
- AC-F01-2: Wrong password and unknown email return byte-identical problem bodies except `request_id`, and both code paths call the password verifier exactly once.
- AC-F01-3: The 6th failed login in 15 minutes for one account returns 429 with `Retry-After`; a correct password during lockout also returns 429; after the window (fake clock) login works.
- AC-F01-4: Refresh returns a new pair; reusing the old refresh token returns `AUTH_REFRESH_INVALID` and also invalidates the new token.
- AC-F01-5: Logout makes the refresh token unusable; the access token expires naturally.
- AC-F01-6: A test enumerates all registered routes and fails if any lacks a policy.
- AC-F01-7: Anonymous gets 401 and a customer gets 403 on every admin route; support gets 403 on admin-only routes and 200 on support routes.
- AC-F01-8: Customer A reading customer B's transfer, conversation, ticket or message list gets 404 identical to a random id.
- AC-F01-9: Confirm above the threshold without a PIN returns `PIN_REQUIRED`; three wrong PINs return `PIN_LOCKED` (423); a correct PIN while locked is rejected; after 15 minutes (fake clock) a correct PIN works and resets the counter.
- AC-F01-10: Each event in the list above produces exactly one audit entry with the expected action and result.
- AC-F01-11: Database inspection shows password and PIN hashes are argon2id and refresh tokens exist only as hashes.
- AC-F01-12: An expired access token returns `AUTH_TOKEN_EXPIRED`; a token with a modified payload or signature returns 401.

## Errors and security

Codes in `API.md`. Secrets (JWT signing key of at least 32 random bytes) come from the environment; startup fails if missing or too short. Passwords and PINs are never logged. CORS allows only configured origins. Account enumeration is prevented on login; the PIN endpoint reveals only lock state for the authenticated user.

## Interfaces and dependencies

Tables `users`, `refresh_tokens`; Redis `login:fail:*`; ports `Clock`, `PasswordHasher`, `TokenSigner`, `AuditSink`; routes in `API.md` "Authentication".

## Tests required

Unit: token claims, hasher wrapper, PIN counter logic with fake clock, policy declaration helper. Integration: all acceptance criteria against real Postgres and Redis. Security suite: authorization matrix (AC-F01-6 to 8), enumeration and timing-path test. Regression test added for any defect found.
