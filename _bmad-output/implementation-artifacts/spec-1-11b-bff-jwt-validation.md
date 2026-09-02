---
title: 'Story 1.11 (part 2): BFF JWT validation'
type: 'feature'
created: '2026-09-02'
status: 'done'
review_loop_iteration: 0
baseline_commit: '8b8287cc055074e53935a42a39df67678d31add5'
context:
  - '{project-root}/.claude/rules/access-control-invariants.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The BFF is the platform's browser boundary (AD-5) but validates nothing today —
`main.ts` has a literal `// TODO(AD-5): wire the Authorization Service guard here before any real
endpoint ships` — so `organisational-relationships`'s endpoints forward whatever `Authorization`
header a caller sends, unverified, straight to `people-service`.

**Approach:** Add a global Passport JWT guard to the BFF (`passport-jwt` + `jwks-rsa`, the standard
NestJS pattern) that validates a bearer token's signature against Keycloak's real JWKS and its
`iss` claim against the realm's real issuer, rejecting every route except `/health` when the token
is missing/expired/malformed/signature-invalid. Proven end-to-end against a real Keycloak
(Testcontainers, reusing `authentication-service`'s own `keycloak/realm-export.json`) — a real
token obtained via direct-grant login must pass the guard; a tampered/expired one must not.

## Boundaries & Constraints

**Always:**
- The guard is global (`APP_GUARD`), not per-controller — every current and future BFF route is
  protected by default; a route opts OUT via an explicit `@Public()` decorator, never the other way
  around. Only `/health` gets `@Public()`.
- `issuer`/`jwksUri` are derived by the BFF itself from its own `KEYCLOAK_BASE_URL`/
  `KEYCLOAK_REALM` env vars (same two values `authentication-service`'s `AppConfig` reads), the
  same string-derivation `AppConfig.Issuer`/`JwksUri` use — NOT a live bootstrap-time HTTP call to
  `authentication-service`. A live cross-service call during Nest module construction would make
  the BFF unable to start whenever `authentication-service` is down, and would break the existing
  `test/app.e2e-spec.ts` (which builds the full `AppModule` with no `authentication-service`
  running). `authentication-service`'s `GET /api/v1/auth/config` stays a valid, useful endpoint for
  operators/other consumers — this story just doesn't route through it at BFF bootstrap.
- `JwtStrategy.validate` returns only `{ sub: payload.sub }` — no role/permission claim is ever
  read from the token or attached to `request.user`, per the design guardrail already logged in
  `deferred-work.md` from Story 1.11's first slice.
- `organisational-relationships`'s existing raw-`Authorization`-header forwarding to
  `people-service` is unchanged — the guard runs before the controller, so by the time it executes
  the token is already verified; the controller still needs the raw header string to forward
  upstream (`people-service`'s own JWT validation is Story 1.11's next slice, `spec-1-11c-*`).

**Ask First:** None anticipated.

**Never:**
- No change to `people-service`/`access-control-service`/any other domain service — they still
  don't validate anything yet (`spec-1-11c-*`'s job).
- No new BFF-owned authorization/policy logic — the guard only proves "this token is real,"
  never "is this person allowed to do X" (AD-5: the BFF must not become a second policy engine).
- No session/cookie handling, no login/logout endpoint, no redirect flow — the browser is assumed
  to already hold a valid bearer token by whatever means (out of scope, not yet built).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid token | Real Keycloak-issued JWT (direct-grant, `bff-confidential` realm) in `Authorization: Bearer <token>` | Request reaches the controller; `request.user.sub` is the token's `sub` claim | N/A |
| Missing token | No `Authorization` header | `401 Unauthorized`, request never reaches the controller | N/A |
| Malformed token | `Authorization: Bearer not-a-jwt` | `401 Unauthorized` | N/A |
| Wrong-issuer/signature token | A JWT signed by a different key or with a tampered `iss` | `401 Unauthorized` | N/A |
| Expired token | A real token past its `exp` | `401 Unauthorized` | N/A |
| Health check | `GET /health`, no `Authorization` header | `200`, unaffected by the guard | N/A |

</frozen-after-approval>

## Code Map

- `services/bff/src/main.ts` — the TODO comment this story resolves; read then remove it once the
  guard is wired
- `services/bff/src/app.module.ts` — register `AuthModule`, add the guard as `APP_GUARD`
- `services/bff/src/config/env.validation.ts` — add `KEYCLOAK_BASE_URL`/`KEYCLOAK_REALM` to the
  Joi schema, same required-value style already used for `PEOPLE_SERVICE_URL`
- `services/bff/src/modules/auth/` — NEW: `auth.module.ts`, `jwt.strategy.ts`, `public.decorator.ts`
  (`@Public()` + `IS_PUBLIC_KEY` metadata key), `jwt-auth.guard.ts` (extends `AuthGuard('jwt')`,
  overrides `canActivate` to short-circuit on `@Public()` via `Reflector`)
- `services/bff/src/modules/health/health.controller.ts` — read-only reference; apply `@Public()`
  to its route here
- `services/authentication-service/keycloak/realm-export.json` — read-only reference: reuse this
  exact file for the new integration test's Testcontainers-Keycloak fixture (same realm/client/test
  user Story 1.11's first slice already proved works)
- `services/authentication-service/src/AuthenticationService.Api/Configuration/AppConfig.cs` —
  read-only reference: mirror its `Issuer`/`JwksUri` string-derivation exactly (same two source
  values, same formula) so the BFF's independently-derived values are guaranteed to match
  Keycloak's real ones
- `services/bff/test/app.e2e-spec.ts` — existing e2e test to keep passing unmodified (only exercises
  `/health`, which stays public)
- `services/people-service/package.json` — reference for the `@testcontainers/postgresql` dependency
  shape; use the base `testcontainers` package for a generic Keycloak container (same approach
  already proven for the .NET side, and the base `testcontainers` npm package's generic container
  builder works the same way in Node)

## Tasks & Acceptance

**Execution:**
- [x] `services/bff/package.json` — add `@nestjs/passport`, `passport`, `passport-jwt`, `jwks-rsa`,
  `@types/passport-jwt`, and `testcontainers` (dev dependency)
- [x] `services/bff/src/config/env.validation.ts` — add `KEYCLOAK_BASE_URL`/`KEYCLOAK_REALM`
- [x] `services/bff/src/modules/auth/jwt.strategy.ts` — `passport-jwt` + `jwks-rsa`
  `passportJwtSecret`, `issuer`/`algorithms: ['RS256']` validation, `validate` returns `{ sub }`
  only
- [x] `services/bff/src/modules/auth/public.decorator.ts` — `@Public()` + `IS_PUBLIC_KEY`
- [x] `services/bff/src/modules/auth/jwt-auth.guard.ts` — global guard, `@Public()`-aware
- [x] `services/bff/src/modules/auth/auth.module.ts` — wires the above; exports the guard/strategy
- [x] `services/bff/src/app.module.ts` — import `AuthModule`, register the guard as `APP_GUARD`
- [x] `services/bff/src/modules/health/health.controller.ts` — `@Public()` on its route
- [x] `services/bff/src/main.ts` — remove the now-resolved TODO comment
- [x] `services/bff/src/modules/auth/__tests__/jwt.strategy.spec.ts` — unit test:
  `validate` returns exactly `{ sub }`, nothing else, from a sample payload
- [x] `services/bff/test/jwt-guard.e2e-spec.ts` — integration test: boot a real Keycloak
  (Testcontainers, `authentication-service`'s realm-export.json reused), obtain a real token via
  direct-grant, and prove all six I/O-matrix rows against the full `AppModule` + supertest

**Acceptance Criteria:**
- Given a request to any non-public BFF route with no `Authorization` header, when it's handled,
  then the response is `401` and the request never reaches the controller
- Given a request bearing a real, valid Keycloak-issued token, when it's handled, then the request
  reaches the controller and `request.user.sub` equals the token's `sub` claim
- Given a request bearing an expired or tampered token, when it's handled, then the response is
  `401`
- Given a request to `/health` with no `Authorization` header, when it's handled, then the response
  is unaffected (still `200`)

## Design Notes

Deriving `issuer`/`jwksUri` independently in both `authentication-service` (.NET) and the BFF
(Node), from the same two raw values (`KEYCLOAK_BASE_URL`/`KEYCLOAK_REALM`) and the same formula,
is a deliberate simplicity trade-off over a live cross-service discovery call: it keeps the BFF
startable independent of `authentication-service`'s own uptime, and keeps this story's own tests
free of a hard dependency on an as-yet-Dockerfile-less service. If a future story needs true
single-source-of-truth discovery (e.g. once Keycloak's hostname genuinely differs per environment
in a way duplication can't track), that's a real follow-up, not a defect in this design today —
log it to `deferred-work.md` if it becomes a real problem rather than solving it speculatively now.

## Review Findings

Full adversarial review (identity-access-engineer + blind-hunter + edge-case-hunter +
verification-gap), all findings resolved or deferred with rationale:

- [x] [Review][Patch] No `audience` validation — fixed: added `audience: 'bff-confidential'` to
  `StrategyOptions`, plus a new `bff-confidential-audience` protocol mapper in
  `authentication-service/keycloak/realm-export.json` (Keycloak's default `aud` wouldn't have
  satisfied the check otherwise); verified against the real Testcontainers-Keycloak.
- [x] [Review][Patch] No trailing-slash trim on `KEYCLOAK_BASE_URL` in `deriveIssuer` — fixed,
  mirrors `AppConfig.Load`'s `.TrimEnd('/')`.
- [x] [Review][Patch] `KEYCLOAK_BASE_URL`/`KEYCLOAK_REALM` had silent Joi defaults instead of being
  required — fixed, both now `.required()`; a new `test/jest-e2e-setup.ts` supplies test-only
  placeholders so `app.e2e-spec.ts` can still import `AppModule`.
- [x] [Review][Patch] `KEYCLOAK_REALM` had no character-set validation — fixed, matches
  `AppConfig.ValidateRealmName`'s pattern.
- [x] [Review][Patch] No unit test for `JwtAuthGuard`'s own `@Public()`-bypass logic — fixed, added
  `jwt-auth.guard.spec.ts` with a mocked `Reflector`.
- [x] [Review][Patch] Missing/blank `sub` claim silently "authenticated" with no usable identity —
  fixed, `validate()` now throws `UnauthorizedException`.
- [x] [Review][Patch] Dead/redundant `JwtAuthGuard` export from `AuthModule` — fixed, removed;
  doc comment corrected.
- [x] [Review][Patch] No test proved the guard protects the one real production controller
  (`organisational-relationships`), only a synthetic probe route — fixed, added real-route cases
  to `jwt-guard.e2e-spec.ts` (no-token → 401 with upstream `fetch` never called; valid token → not
  401/403).
- [x] [Review][Patch] `services/bff/CLAUDE.md` not updated for this slice — fixed.
- [x] [Review][Patch] No `clockTolerance` — fixed, `jsonWebTokenOptions: { clockTolerance: 5 }`;
  the expired-token e2e test's wait was extended accordingly.
- [x] [Review][Patch] `test:e2e` never ran in CI, so this story's entire Testcontainers proof was
  unverified by any automated pipeline — fixed via an opt-in `run_e2e` input on
  `_reusable-node-ci.yml` (default `false`), set `true` only in `bff-ci.yml`; confirmed no other
  service's CI workflow is affected.
- [x] [Review][Defer] `KC_HOSTNAME`/`iss`-drift risk is now live, not just theoretical (this slice
  is the trigger condition Story 1.11's first-slice review named) — logged to `deferred-work.md`.
- [x] [Review][Defer] No cross-realm wrong-issuer/wrong-audience test — logged to
  `deferred-work.md`, disproportionate effort for a single-realm reality.
- [x] [Review][Defer] `handleRequest` doesn't distinguish a JWKS-fetch failure from an invalid
  token (observability, not security) — logged to `deferred-work.md`.
- [x] [Review][Defer] No test for a non-Bearer auth scheme/empty Bearer value — logged to
  `deferred-work.md`.
- [x] [Review][Defer] No shared fixture catching a future .NET/Node issuer-formula desync — logged
  to `deferred-work.md`.

## Suggested Review Order

**The guard itself**

- Entry point — issuer/audience/algorithm/clock-tolerance all set here.
  [`jwt.strategy.ts:49`](../../services/bff/src/modules/auth/jwt.strategy.ts#L49)
- Fail-closed on a missing/blank `sub`, added after review found it silently "authenticated."
  [`jwt.strategy.ts:71`](../../services/bff/src/modules/auth/jwt.strategy.ts#L71)
- `@Public()` bypass — the only way a route opts out of protection.
  [`jwt-auth.guard.ts:17`](../../services/bff/src/modules/auth/jwt-auth.guard.ts#L17)
- Global registration — every route protected by default (AD-5).
  [`app.module.ts`](../../services/bff/src/app.module.ts)

**Realm config**

- The audience mapper review found missing — without it, `aud` wouldn't satisfy the new check.
  [`realm-export.json:31`](../../services/authentication-service/keycloak/realm-export.json#L31)

**Tests**

- Proves the guard protects the one real production route, not just a synthetic probe.
  [`jwt-guard.e2e-spec.ts:314`](../../services/bff/test/jwt-guard.e2e-spec.ts#L314)
- All six I/O-matrix rows against a real Keycloak.
  [`jwt-guard.e2e-spec.ts:233`](../../services/bff/test/jwt-guard.e2e-spec.ts#L233)
- `@Public()`-bypass unit coverage, missing before review caught the gap.
  [`jwt-auth.guard.spec.ts`](../../services/bff/src/modules/auth/__tests__/jwt-auth.guard.spec.ts)

## Verification

**Commands:**
- `cd services/bff && npm install && npm run build && npm run lint` — expected: clean
- `cd services/bff && npm test` — expected: unit tests pass
- `cd services/bff && npm run test:e2e` — expected: e2e tests pass, including the new
  Testcontainers-Keycloak guard test (Docker required locally)

**Actual result:** Build/lint clean. 16/16 unit tests, 9/9 e2e tests passed, including the real
Testcontainers-Keycloak integration suite (verified independently, not just by the implementing
subagent).
