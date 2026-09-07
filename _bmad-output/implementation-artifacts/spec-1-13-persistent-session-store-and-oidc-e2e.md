---
title: 'Story 1.13: Persistent BFF session store and OIDC end-to-end tests'
type: 'feature'
created: '2026-09-07'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'f31b5db723173862f69ced67928d6ca1b521e17b'
context:
  - '{project-root}/services/bff/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 1.12 shipped with two documented limitations: the default `MemoryStore` leaks memory, resets on BFF restart, and has no userId→session index — making back-channel logout inoperable in any multi-request environment; and the full PKCE sign-in/sign-out flow has no automated end-to-end test coverage.

**Approach:** Replace `MemoryStore` with `connect-pg-simple` backed by the Postgres instance already present in every environment; fix the back-channel logout endpoint to destroy the matching session via userId scan of the persistent store; and add Testcontainers-based e2e tests driving the full PKCE authorize→callback→me→logout cycle using a headless HTTP redirect-follow against a real Keycloak container.

## Boundaries & Constraints

**Always:**
- Use `connect-pg-simple` — not `connect-redis` (no Redis in the current stack).
- `DATABASE_URL` is an optional Joi entry; when absent BFF falls back to `MemoryStore` with a startup warning — preserving the zero-infra local-dev path.
- The back-channel logout userId lookup must use the validated logout token's `sub` claim — never a caller-supplied value.
- OIDC e2e tests must run against a real Testcontainers Keycloak container using the same `realm-export.json` as `test/jwt-guard.e2e-spec.ts`.
- All session fields (userId, email, accessToken, refreshToken, idToken, accessTokenExpiresAt, oidcState, oidcVerifier) must survive a round-trip through the PostgreSQL store.

**Ask First:**
- Whether `DATABASE_URL` should be a shared connection string in `infra/.env.example` or remain a BFF-only variable (current approach: BFF-only).

**Never:**
- No Playwright or browser binary installation — PKCE e2e flow is driven by headless HTTP redirect-follow (parse Keycloak HTML login form, POST credentials via `application/x-www-form-urlencoded`).
- No change to session cookie settings, outbound token-injection logic, or downstream bearer-token validation.
- No new authorization policy in the BFF.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| BFF starts with DATABASE_URL | `DATABASE_URL` → reachable Postgres | Session store uses `connect-pg-simple`; `session` table auto-created if missing | Fail-fast if Postgres unreachable on first session write |
| BFF starts without DATABASE_URL | No `DATABASE_URL` in env | MemoryStore fallback; warning logged to stdout | — |
| Sessions survive BFF restart | Persistent store active; session established; BFF process restarted | Same cookie still authenticates on next BFF process | — |
| Back-channel logout (persistent store) | Valid `logout_token` JWT; userId has a matching session in store | Session destroyed; next request with that cookie → 401 | 400 if token invalid; no-op if no matching session |
| PKCE e2e: full happy path | Real Testcontainers Keycloak; headless form submit | login redirect → credentials posted → callback → session created → /me 200 { sub, email } → logout → 401 | — |
| PKCE e2e: state mismatch | `/callback` with wrong `state` query param | 400 Bad Request; no session created or modified | — |
| PKCE e2e: /me without session | No session cookie | 401 Unauthorized | — |

</frozen-after-approval>

## Code Map

- `services/bff/package.json` — add `connect-pg-simple@^3.2.0`, `@types/connect-pg-simple`, `pg@^8.13.0`, `@types/pg` (none currently present)
- `services/bff/src/config/env.validation.ts` (line 33, end of schema) — add `DATABASE_URL: Joi.string().uri().optional()`
- `services/bff/src/main.ts` (lines 29–48) — replace unconditional MemoryStore block with conditional: `DATABASE_URL` set → `connect-pg-simple(session)` with `createTableIfMissing: true`; absent → `MemoryStore` + `console.warn`
- `services/bff/.env.example` — add `DATABASE_URL=` (blank value → MemoryStore in local dev without Postgres)
- `services/bff/src/modules/auth/auth.controller.ts` (lines 199–207) — fix `backchannelLogout()`: after validating logout token, call `req.sessionStore.all()`, filter entries where `session.userId === parsedToken.sub`, destroy each match
- `services/bff/test/oidc-session.e2e-spec.ts` (new) — Testcontainers Keycloak + headless PKCE redirect-follow e2e tests
- `services/bff/test/jwt-guard.e2e-spec.ts` (lines 156–182) — container setup pattern to replicate (`GenericContainer('quay.io/keycloak/keycloak:26.0')`, realm-export copy, JWKS readiness wait)

## Tasks & Acceptance

**Execution:**
- [x] `services/bff/package.json` — add `connect-pg-simple@^3.1.2` (latest v3; 3.2.0 does not exist on npm), `@types/connect-pg-simple`, `pg@^8.13.0`, `@types/pg`; `npm install` run
- [x] `services/bff/src/config/env.validation.ts` — add `DATABASE_URL: Joi.string().uri().optional()`
- [x] `services/bff/.env.example` — add `DATABASE_URL=` line (blank = MemoryStore)
- [x] `services/bff/src/main.ts` — conditional store initialization: `connect-pg-simple` when `DATABASE_URL` set, else `MemoryStore` + startup warning
- [x] `services/bff/src/modules/auth/auth.controller.ts` — fix `backchannelLogout()` to scan `sessionStore.all()` and destroy sessions matching the validated token's `sub`
- [x] `services/bff/test/oidc-session.e2e-spec.ts` (new) — Testcontainers Keycloak; headless PKCE redirect-follow; 8 scenarios: full happy path (login→callback→/me→logout), state mismatch → 400, /me without session → 401, back-channel logout guards (missing token, invalid JWT, unverifiable JWT). `OIDC_CALLBACK_URL` uses localhost:3001 (matches realm-export.json's registered wildcard) regardless of BFF_PORT=3091. NOT RUN — Docker unavailable in implementation session; requires `npm run test:e2e` with Docker.

**Acceptance Criteria:**
- Given `DATABASE_URL` is set at startup, when the BFF process restarts, sessions established before the restart are still valid and users do not need to re-authenticate
- Given Keycloak sends a valid back-channel logout token, when the BFF receives it with a persistent store active, the matching session is destroyed and the next request with that cookie returns 401
- Given a real Testcontainers Keycloak, when the full PKCE login→callback→/me→logout cycle is driven by the e2e test suite, all five auth endpoints respond per the Story 1.12 I/O matrix and no session cookie authenticates after logout

## Design Notes

**connect-pg-simple initialization:** Use `require('connect-pg-simple')(session)` (CJS, consistent with current CommonJS Jest setup). Instantiate a `new Pool({ connectionString: databaseUrl })` passed to the store constructor. Set `createTableIfMissing: true` — no separate migration step. Pool connection is lazy; Postgres unreachability surfaces on the first session write, not at startup.

**Back-channel logout store scan:** `express-session`'s `Store` interface exposes `.all(callback)` returning `{ [sid]: sessionData }`. Iterate entries, compare `session.userId` against the validated token's `sub`, call `.destroy(sid)` for each match. O(sessions) but logout is rare; no separate userId column or index needed at this scale.

**PKCE headless test flow:** (1) GET `/api/v1/auth/login` with a cookie jar → capture `Location` header (Keycloak auth URL) and BFF session cookie; (2) GET Keycloak auth URL → parse HTML `<form action>` and hidden inputs (`execution`, etc.); (3) POST `username`, `password`, and hidden inputs as `application/x-www-form-urlencoded` to form action → follow redirect chain back to `/api/v1/auth/callback`; (4) supertest follows the redirect to BFF `/callback` — code exchange completes, session cookie is populated; (5) GET `/api/v1/auth/me` with session cookie → assert `{ sub, email }`. Uses `axios` (already a dev dependency) with `maxRedirects: 0` to control each redirect hop manually.

## Suggested Review Order

**Session store setup**

- Conditional pg store vs MemoryStore; pool scoped for SIGTERM cleanup
  [`main.ts:44`](../../services/bff/src/main.ts#L44)

- Optional DATABASE_URL Joi entry; absent → MemoryStore with no validation error
  [`env.validation.ts:36`](../../services/bff/src/config/env.validation.ts#L36)

- Pool SIGTERM/SIGINT cleanup registered after listen
  [`main.ts:94`](../../services/bff/src/main.ts#L94)

**Back-channel logout fix**

- Entry point: store.all() scan launched; array-form guard; targetSub filter
  [`auth.controller.ts:210`](../../services/bff/src/modules/auth/auth.controller.ts#L210)

- Array-return branch explicitly logged and skipped (not silently discarded)
  [`auth.controller.ts:237`](../../services/bff/src/modules/auth/auth.controller.ts#L237)

- targetSub && guard prevents undefined-sub matching unset-userId sessions
  [`auth.controller.ts:250`](../../services/bff/src/modules/auth/auth.controller.ts#L250)

- destroy() wrapped in try/catch to prevent synchronous throw escaping Promise
  [`auth.controller.ts:262`](../../services/bff/src/modules/auth/auth.controller.ts#L262)

**OIDC e2e test coverage**

- performLogin() helper: GET /login → parse Keycloak HTML form → POST creds → replay callback via supertest
  [`oidc-session.e2e-spec.ts:250`](../../services/bff/test/oidc-session.e2e-spec.ts#L250)

- Full PKCE happy-path scenario: asserts sub/email, session destroyed after logout
  [`oidc-session.e2e-spec.ts:384`](../../services/bff/test/oidc-session.e2e-spec.ts#L384)

- /me without session → 401 (simplest guard path; sanity check)
  [`oidc-session.e2e-spec.ts:337`](../../services/bff/test/oidc-session.e2e-spec.ts#L337)

**Supporting changes**

- Unit tests: store-scan destroys matching sid; no-op when no match
  [`auth.controller.spec.ts:309`](../../services/bff/src/modules/auth/__tests__/auth.controller.spec.ts#L309)

- New runtime deps: connect-pg-simple, pg; devDeps: @types variants
  [`package.json:37`](../../services/bff/package.json#L37)

- DATABASE_URL blank-valued entry; comment explains MemoryStore fallback
  [`.env.example:19`](../../services/bff/.env.example#L19)

- Test glob extended to e2e-spec.ts; unsafe-* rules suppressed for axios-using e2e tests
  [`eslint.config.mjs:13`](../../services/bff/eslint.config.mjs#L13)

## Verification

**Commands:**
- `cd services/bff && npm install && npm run build && npm run lint` — expected: clean
- `cd services/bff && npm test` — expected: all unit tests pass, no regressions
- `cd services/bff && npm run test:e2e` — expected: `oidc-session.e2e-spec.ts` all scenarios green (Docker required for Testcontainers)
