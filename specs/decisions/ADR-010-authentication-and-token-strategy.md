# ADR-010: Authentication and token strategy

Status: Proposed (2026-10-14). Amended 2026-10-15 by ADR-018: identity lives in `edge`; access tokens are EdDSA-signed and verified by every service; the PIN check issues a short step-up assertion for `transfers`.

## Context

The API serves a SPA and must demonstrate sound token handling without depending on an external identity provider.

## Decision

- Email and password with argon2id.
- Access token: JWT signed with Ed25519 (EdDSA), 900 seconds, claims `iss`, `aud`, `sub`, `role`, `loc`, `iat`, `exp`, `jti`; no personal data. Only `edge` holds the private key.
- Refresh token: opaque random value, stored only as a hash, rotated on every use, grouped in a family; reuse of a rotated token revokes the family and is audited.
- Roles: customer, support, admin; every route declares allowed roles; undeclared routes are rejected at startup.
- Transaction PIN (argon2id) required from a configurable amount; 3 wrong attempts lock for 15 minutes; counters in Postgres.
- Login throttling: 5 failures per 15 minutes per account and per IP, counted in Redis. If Redis is unavailable, login throttling fails closed, while general API rate limits degrade to per-process limits (PRD failure-modes table).
- The web app keeps tokens in memory only. A reload requires login. This is a deliberate trade-off to avoid XSS-readable persistent storage in the demo.

## Alternatives considered

- Server sessions with cookies: simple, but adds CSRF concerns and statefulness to the demo.
- HttpOnly refresh cookie with SameSite: better user experience on reload; adds CSRF design and cross-origin cookie complexity for a staging deployment. Documented as the production recommendation.
- External IdP (OIDC): realistic, but out of scope.

## Consequences

Demonstrates rotation and reuse detection. Users log in again after a reload.

## Revisit when

The app needs persistent login or third-party sign-in.
