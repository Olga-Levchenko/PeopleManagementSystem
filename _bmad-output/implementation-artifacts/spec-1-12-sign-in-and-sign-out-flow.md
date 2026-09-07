---
title: 'Story 1.12: Interactive sign-in and sign-out via Keycloak OIDC'
type: 'feature'
created: '2026-09-07'
status: 'done'
review_loop_iteration: 0
baseline_commit: '074868ec2992f7fb6439c85f38f3868d02eb3c3b'
context:
  - '{project-root}/.claude/rules/access-control-invariants.md'
  - '{project-root}/services/bff/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The platform has JWT validation wired at the BFF and domain services but no way for a browser user to authenticate — the frontend has no login screen, no auth context, and every unauthenticated API call returns 401.

**Approach:** Implement BFF-initiated OIDC authorization-code flow with PKCE (`S256`). The BFF gains five auth endpoints (`/login`, `/callback`, `/logout`, `/backchannel-logout`, `/me`), `express-session` middleware (in-memory store for local dev), and a session-aware guard extension. The frontend gains a sign-in page, auth context, protected routes, and a sign-out button. Back-channel logout from Keycloak invalidates BFF sessions, closing the deferred-work item from spec-1-11.

## Boundaries & Constraints

**Always:**
- PKCE `S256` on every authorization request.
- Session cookie: `HttpOnly: true`, `SameSite: Lax`, `Secure: true` in non-development environments.
- Access and refresh tokens stored server-side in the BFF session only — never in a response body, localStorage, sessionStorage, or URL fragment.
- BFF extracts the stored access token from session and injects `Authorization: Bearer <token>` when forwarding to domain services — downstream bearer-token validation is unchanged.
- Back-channel logout from Keycloak must immediately destroy the matching BFF session.
- `openid-client@^5` + `express-session` for OIDC flow and session middleware — no `passport-openidconnect` (ESM-only; incompatible with this project's CommonJS Jest setup).
- In-memory session store is acceptable for local dev only; document that a persistent store (`connect-redis` or `connect-pg-simple`) is required before any multi-process deployment.
- The existing `JwtStrategy` bearer path is preserved for any service-to-service caller that already carries a bearer token.
- `fullScopeAllowed: false` must remain unchanged in `realm-export.json` — no role or permission claims in tokens.

**Ask First:**
- Verify `openid-client@^5` CJS compatibility on Node 22 with `node --print "require('openid-client')"` before pinning — halt if it throws (pick the newest v5 patch that works).

**Never:**
- No token or credential in any client-visible response body, URL parameter, or URL fragment.
- No new authorization policy logic in the BFF — this story is authentication only.
- No change to how people-service or access-control-service validate incoming bearer tokens.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Unauthenticated visit | Browser loads any protected frontend route, no session cookie | Frontend redirects to `/login` | — |
| Sign-in initiated | `GET /api/v1/auth/login` (no session) | BFF generates PKCE verifier + state, stores in session, 302-redirects to Keycloak authorization endpoint | — |
| Already signed in | `GET /api/v1/auth/login` (valid session) | 302-redirect to frontend `/` (skip Keycloak) | — |
| Valid Keycloak callback | `GET /api/v1/auth/callback?code=X&state=Y`, state matches session | BFF exchanges code for tokens, stores `accessToken`/`refreshToken`/`userId` in session, 302-redirects to frontend `/` | — |
| State mismatch | `GET /api/v1/auth/callback` with wrong/missing state | 400 Bad Request; no session modified | — |
| `GET /api/v1/auth/me` | Valid session cookie | `200 { sub, email }` | 401 if no/expired session |
| Sign-out | `POST /api/v1/auth/logout` | BFF destroys session, clears cookie, calls Keycloak end_session, 302-redirects to `/login` | Keycloak unreachable: destroy local session and redirect anyway |
| Keycloak back-channel logout | `POST /api/v1/auth/backchannel-logout` with `logout_token` JWT | BFF validates logout token (JWKS already used by JwtStrategy), destroys matching session | 400 if token invalid |
| Access token expired | Protected BFF endpoint, session present, access token `exp` elapsed | BFF refreshes via stored refresh token, updates session, request proceeds | Refresh fails → 401; frontend interceptor redirects to `/login` |
| Protected endpoint, no session | Any BFF route without session cookie | 401 Unauthorized | — |

</frozen-after-approval>

## Code Map

**BFF — new additions:**
- `services/bff/src/modules/auth/oidc.service.ts` (new) — wraps `openid-client` discovery (`Issuer.discover`), exposes `buildAuthorizationUrl(state, pkceChallenge)`, `exchangeCode(code, redirectUri, codeVerifier)`, `refreshAccessToken(refreshToken)`, `endSession(idToken)`, `validateLogoutToken(logoutToken)` (reuses the same JWKS as `JwtStrategy`)
- `services/bff/src/modules/auth/auth.controller.ts` (new) — five endpoints per I/O matrix; `/login`, `/callback`, `/logout`, `/backchannel-logout` all `@Public()`; `/me` validated via session (explicit session check, not JWT guard)
- `services/bff/src/modules/auth/auth.module.ts` — register `OidcService` + `AuthController` alongside existing `JwtStrategy`

**BFF — modifications:**
- `services/bff/src/modules/auth/jwt-auth.guard.ts` — prepend session check in `canActivate`: if `req.session?.userId` is set, assign `req.user = { sub: req.session.userId }` and return `true`; else fall through to existing JWT bearer path (unchanged)
- `services/bff/src/main.ts` — add `app.use(session({ secret, resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax', secure: NODE_ENV === 'production' } }))` before `app.init()`
- `services/bff/src/modules/organisational-relationships/` (and any other forwarding modules) — when building outbound `Authorization` header: prefer `req.headers.authorization` if present; otherwise use `Bearer ${req.session?.accessToken}`
- `services/bff/src/config/env.validation.ts` — add `KEYCLOAK_CLIENT_SECRET` (required), `SESSION_SECRET` (string min 32, required), `OIDC_CALLBACK_URL` (URI, required)
- `services/bff/.env.example` — add three new vars with example values
- `services/bff/CLAUDE.md` — document session-based auth model and in-memory store limitation

**Keycloak:**
- `services/authentication-service/keycloak/realm-export.json` — on the `bff-confidential` client object, add `"backchannelLogoutUrl": "http://localhost:3001/api/v1/auth/backchannel-logout"` and `"backchannelLogoutSessionRequired": true`

**Frontend:**
- `services/frontend/src/contexts/AuthContext.tsx` (new) — on mount calls `GET ${VITE_API_BASE_URL}/api/v1/auth/me`; exposes `{ user: { sub, email } | null, loading: boolean, signOut: () => Promise<void> }`; `signOut` posts to `/api/v1/auth/logout` then redirects to `/login`
- `services/frontend/src/components/ProtectedRoute.tsx` (new) — renders `Outlet` if `user` non-null; shows spinner while `loading`; `<Navigate to="/login">` if not authenticated
- `services/frontend/src/pages/LoginPage.tsx` (new) — centered card with "Sign in" button; `onClick` does `window.location.href = '${VITE_API_BASE_URL}/api/v1/auth/login'` (full-page navigation, not axios)
- `services/frontend/src/router/index.tsx` — add `/login` (public, `LoginPage`); wrap all existing routes in `ProtectedRoute`
- `services/frontend/src/api/client.ts` — replace TODO stub with 401 response interceptor that sets `window.location.href = '/login'`

## Tasks & Acceptance

**Execution:**
- [x] `services/bff/package.json` — add `openid-client@^5`, `express-session`, `@types/express-session`; run CJS compatibility check before pinning
- [x] `services/bff/src/config/env.validation.ts` — add `KEYCLOAK_CLIENT_SECRET`, `SESSION_SECRET` (min 32), `OIDC_CALLBACK_URL`
- [x] `services/bff/.env.example` + `.env` (local, gitignored) — add the three new vars
- [x] `services/bff/src/modules/auth/oidc.service.ts` — OIDC discovery, auth URL builder, code exchange, token refresh, end_session, logout token validation
- [x] `services/bff/src/modules/auth/auth.controller.ts` — five endpoints per I/O matrix
- [x] `services/bff/src/modules/auth/auth.module.ts` — register `OidcService` + `AuthController`
- [x] `services/bff/src/modules/auth/jwt-auth.guard.ts` — session-check prepended; bearer path unchanged
- [x] `services/bff/src/main.ts` — `express-session` middleware wired
- [x] `services/bff/src/modules/organisational-relationships/` — outbound `Authorization` header injection from session
- [x] `services/authentication-service/keycloak/realm-export.json` — add back-channel logout config to `bff-confidential`
- [x] `services/frontend/src/contexts/AuthContext.tsx` — auth context + `useAuth` hook
- [x] `services/frontend/src/components/ProtectedRoute.tsx` — session-aware route guard
- [x] `services/frontend/src/pages/LoginPage.tsx` — sign-in page
- [x] `services/frontend/src/router/index.tsx` — `/login` route + protected wrapper
- [x] `services/frontend/src/api/client.ts` — 401 interceptor
- [x] `services/bff/src/modules/auth/__tests__/` — unit tests for `OidcService` (mock openid-client), `AuthController` (mock `OidcService`), session guard extension

**Acceptance Criteria:**
- Given an unauthenticated browser, when loading any protected route, then the frontend displays the login page
- Given the user clicks "Sign in" and authenticates with Keycloak, when redirected back, then they land at the frontend home page as an authenticated user visible via `GET /api/v1/auth/me`
- Given an authenticated session, when the user clicks "Sign out", then the BFF session is destroyed and the user is redirected to the login page
- Given Keycloak sends a back-channel logout for a session, when the BFF receives it, then the matching session is immediately invalidated and subsequent requests with that session cookie return 401
- Given a protected BFF endpoint with no session cookie, when called, then the response is 401
- Given a valid session with an expired access token, when a protected BFF endpoint is called, then the BFF silently refreshes the access token and the request succeeds

## Design Notes

**Token refresh location:** Place refresh logic inside the session-check branch of `jwt-auth.guard.ts`. Store `accessTokenExpiresAt` (epoch seconds) in the session alongside the token; if within 30 seconds of expiry, call `OidcService.refreshAccessToken()` and update session before proceeding. This keeps refresh centralized rather than duplicated across forwarding modules.

**Back-channel logout token validation:** Keycloak's `logout_token` is a signed JWT — validate it against the same JWKS URI already used by `JwtStrategy` (derive from `KEYCLOAK_BASE_URL`/`KEYCLOAK_REALM`, do not add a second fetcher). Use `openid-client`'s `client.validateLogoutToken()`.

**Cross-origin cookie in local dev:** The BFF session cookie is set from `localhost:3001`. The browser is at `localhost:4200`. The `/login` and `/logout` actions are full-page navigations (not AJAX), so the browser follows redirects across origins and the cookie is set correctly for the BFF's origin. Subsequent BFF API calls from the frontend must be `withCredentials: true` on axios — add this to `client.ts`.

**In-memory session store:** MemoryStore leaks memory and resets on restart — acceptable only for local dev. Document in `CLAUDE.md`: production requires `connect-redis` or `connect-pg-simple`. This is a tracked follow-up, not a blocker.

## Verification

**Commands:**
- `cd services/bff && npm install && npm run build && npm run lint` — expected: clean
- `cd services/bff && npm test` — expected: all unit tests pass including new auth/session guard tests
- `cd services/frontend && npm run build && npm run lint` — expected: clean

**Manual checks:**
- With all services running (`infra/docker-compose.yml` up, all four dev servers started): navigate to `http://localhost:4200` → redirected to login page; click "Sign in" → Keycloak login → authenticated home page
- Clicking "Sign out" → session cleared → login page
- `curl -s http://localhost:3001/api/v1/auth/me` (no cookie) → 401
