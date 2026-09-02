---
title: 'Story 1.11 (part 3): Verified identity propagation to people-service'
type: 'feature'
created: '2026-09-02'
status: 'done'
review_loop_iteration: 0
baseline_commit: '0d22c4aa0b08cbfad0b2475a92a89f6d39c52bbf'
context:
  - '{project-root}/.claude/rules/access-control-invariants.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 1.3's `organisational-relationships` write path in `people-service` reads
`RequestActorContext.actorId` (`request.user?.sub`), but nothing in `people-service` has ever
populated `request.user` — every write request throws `UnauthorizedException('Authenticated actor
is required')` unconditionally, regardless of what the BFF forwards. This is `people-service`'s own
already-documented, deliberate blocked-by-1.11 gap (`spec-1-3-...md`'s Review Findings).

**Approach:** Add the identical JWT-validation pattern Story 1.11's second slice already built and
reviewed for the BFF (`passport-jwt` + `jwks-rsa`, global guard, `@Public()` opt-out) to
`people-service`, so `request.user.sub` is populated from the same bearer token the BFF already
forwards unchanged. This is the platform's first "trusted service-to-service" identity hop: the
BFF verifies the browser's token at the edge (Story 1.11b), and `people-service` independently
re-verifies the same token rather than trusting a forwarded header blindly — never a
caller-supplied `actorId` (per this project's hard security rule). Proven end-to-end against a
real Keycloak (Testcontainers), including the specific, already-known downstream failure mode this
unblocks: a valid token now reaches `RequestActorContext` successfully, distinguishable by response
message from the still-deliberately-unavailable permission-check adapter (Story 1.4's job).

## Boundaries & Constraints

**Always:**
- Mirror `services/bff/src/modules/auth/` exactly, including every fix from its own code review:
  RS256-only, issuer check, `audience: 'bff-confidential'`, `clockTolerance: 5`, trailing-slash
  trim on `KEYCLOAK_BASE_URL`, a fail-closed guard on missing/blank `sub`, no dead `JwtAuthGuard`
  export from the auth module. Do not rediscover any of these — copy the already-reviewed pattern.
- `people-service` independently re-validates the token — it never trusts `request.user` set by
  some other service without verifying the signature/issuer/audience itself. This is the "trusted
  service-to-service identity" principle from `deferred-work.md`'s 1-11c entry, applied to the one
  real hop that exists today (BFF → people-service).
- `RequestActorContext` (already built, Story 1.3) is unchanged — it already reads
  `request.user?.sub` correctly; this story only makes that value actually get populated.
- Scope is `people-service` only. `access-control-service`, `work-management-service`, and
  `resourcing-service` have no code today that reads a verified actor identity — adding JWT
  validation there now would be speculative infrastructure with no real consumer, which this
  project's own conventions reject. Log it to `deferred-work.md` instead, to be picked up when each
  service gains a real consumer.

**Ask First:** None anticipated.

**Never:**
- No change to `RequestActorContext`, the permission-check port
  (`UnavailableRelationshipPermissionAdapter` stays exactly as-is — Story 1.4's job), or the
  projection-update port.
- No change to the BFF's own forwarding behavior (already correct, built in the previous slice).
- No new authorization/policy logic in `people-service` — this is authentication only (proving who
  is asking), never a permission decision.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Missing token | `PATCH .../manager` with no `Authorization` header | `401`, generic unauthenticated response, request never reaches the controller | N/A |
| Valid token | Real Keycloak-issued JWT (direct-grant, `bff-confidential` realm) | Request reaches the controller; `RequestActorContext.actorId` succeeds; the request then fails with the *different*, already-existing `401 "Relationship authorization is unavailable"` from the still-deferred permission adapter — proving authentication itself passed | N/A |
| Malformed/tampered/expired token | Same three cases already proven for the BFF | `401`, generic unauthenticated response | N/A |
| Health check | `GET /api/v1/health`, no `Authorization` header | `200`, unaffected by the guard | N/A |

</frozen-after-approval>

## Code Map

- `services/bff/src/modules/auth/` — the exact, already-reviewed pattern to copy: `jwt.strategy.ts`,
  `jwt-auth.guard.ts`, `public.decorator.ts`, `auth.module.ts` — read fully before writing
  `people-service`'s versions, and carry over every review fix (audience, clock tolerance,
  trailing-slash trim, blank-`sub` guard, no dead export)
- `services/people-service/src/app.module.ts` — register the new `AuthModule`, add the guard as
  `APP_GUARD`
- `services/people-service/src/config/env.validation.ts` — add `KEYCLOAK_BASE_URL`/
  `KEYCLOAK_REALM`, required + realm character-set validation (mirror the BFF's already-reviewed
  Joi schema, do not ship with the silent-default mistake that was already caught and fixed there)
- `services/people-service/src/modules/health/health.controller.ts` — apply `@Public()`
- `services/people-service/src/modules/organisational-relationships/request-actor.context.ts` —
  read-only reference: confirms `request.user?.sub` is already the correct read target, no change
  needed
- `services/people-service/src/modules/organisational-relationships/organisational-relationships.service.ts` —
  read-only reference: `assertPermission` → `UnavailableRelationshipPermissionAdapter.canChange`
  rejects with `UnauthorizedException('Relationship authorization is unavailable')` — this exact
  message is what the new e2e test's "valid token" case asserts on, to distinguish it from the
  guard's own generic 401
- `services/authentication-service/keycloak/realm-export.json` — reuse as-is for the new
  Testcontainers fixture (same realm/client/test user every other slice already uses)
- `services/bff/test/jwt-guard.e2e-spec.ts` — the pattern to copy for the new e2e suite (Testcontainers
  Keycloak boot, `ConfigService` override technique, `jest-e2e-setup.ts` placeholder pattern for the
  existing `app.e2e-spec.ts`)

## Tasks & Acceptance

**Execution:**
- [x] `services/people-service/package.json` — add `@nestjs/passport`, `passport`, `passport-jwt`,
  `jwks-rsa`, `@types/passport-jwt`, `testcontainers` (dev), pinned to the same versions already
  proven compatible in `services/bff/package.json`
- [x] `services/people-service/src/config/env.validation.ts` — add required `KEYCLOAK_BASE_URL`/
  `KEYCLOAK_REALM` (with realm character-set restriction)
- [x] `services/people-service/src/modules/auth/jwt.strategy.ts`,
  `public.decorator.ts`, `jwt-auth.guard.ts`, `auth.module.ts` — port from `services/bff`
  verbatim (adjusted only for `people-service`'s own module/import paths)
- [x] `services/people-service/src/app.module.ts` — import `AuthModule`, register `APP_GUARD`
- [x] `services/people-service/src/modules/health/health.controller.ts` — `@Public()`
- [x] `services/people-service/src/modules/auth/__tests__/` — unit tests mirroring the BFF's own
  (`jwt.strategy.spec.ts`, `jwt-auth.guard.spec.ts`)
- [x] `services/people-service/test/jwt-guard.e2e-spec.ts` — integration test: real Keycloak
  (Testcontainers), prove all four I/O-matrix rows, including the specific
  `"Relationship authorization is unavailable"` message assertion for the valid-token case
- [x] `services/people-service/.env.example` — add `KEYCLOAK_BASE_URL`/`KEYCLOAK_REALM`
- [x] `services/people-service/CLAUDE.md` — document per existing convention
- [x] `.github/workflows/_reusable-node-ci.yml`/`people-service-ci.yml` — the `run_e2e` opt-in flag
  already exists (added in the previous slice) — confirm whether `people-service`'s *other*
  e2e test (`app.e2e-spec.ts`, needs real Postgres) would break if `run_e2e: true` were set here.
  It would. Do not set `run_e2e: true` on `people-service-ci.yml` — instead, verify the new
  Testcontainers-only e2e file locally in this task, and log a deferred-work item for CI wiring
  once `people-service`'s Postgres-dependent e2e test is itself made CI-safe (e.g. its own
  Testcontainers-Postgres), which is a separate, pre-existing gap this story didn't create

**Acceptance Criteria:**
- Given a request to `organisational-relationships`'s write endpoints with no/invalid/expired
  token, when it's handled, then the response is `401` and the controller is never reached
- Given a request bearing a real, valid Keycloak-issued token, when it's handled, then
  `RequestActorContext.actorId` resolves successfully and the request proceeds to (and fails at)
  the already-existing, separately-deferred permission-check stub — not at authentication
- Given `GET /api/v1/health` with no `Authorization` header, when it's handled, then the response
  is unaffected (still `200`)

## Design Notes

This closes Story 1.11's full scope as specified in `epics.md`: every domain-service call now
carries a platform-established, independently-verified identity rather than a caller-supplied one,
for the one real write path that exists today. `access-control-service`/`work-management-service`/
`resourcing-service` remain unauthenticated by design — they have no endpoint yet that reads an
actor identity, so there's nothing real to wire up; log each as its own deferred-work entry so it's
picked up the moment a real consumer exists, mirroring the same principle already applied to
`access-control-service`'s own auth gap (logged from Story 1.9's review).

## Review Findings

Full adversarial review (identity-access-engineer + blind-hunter + edge-case-hunter +
verification-gap), all findings resolved or deferred with rationale:

- [x] [Review][Patch] Non-string `sub` claim could throw an unhandled `TypeError` instead of a
  clean 401 — fixed in both `people-service` and `bff`'s `jwt.strategy.ts`.
- [x] [Review][Patch] e2e "valid token" test didn't verify the correct `sub` propagated — fixed,
  decodes the token and asserts `canChange` was called with it.
- [x] [Review][Patch] No unit test for `RequestActorContext` — fixed, added (test-only, class
  itself untouched).
- [x] [Review][Patch] `OutboxPublisherService` background noise flooded the e2e run — fixed via a
  large `OUTBOX_PUBLISHER_INTERVAL_MS` override.
- [x] [Review][Patch] Swagger had no bearer-auth scheme — fixed in both services' `main.ts` +
  `@ApiBearerAuth()` on both `OrganisationalRelationshipsController`s.
- [x] [Review][Patch] Three near-duplicate deferred-work entries — consolidated into one.
- [x] [Review][Patch] No note that `KEYCLOAK_REALM` must match `authentication-service`'s realm —
  fixed in both `CLAUDE.md`/`.env.example` pairs.
- [x] [Review][Patch] `jwt-auth.guard.spec.ts` never tested the "no `@Public()` metadata" default
  case — fixed.
- [x] [Review][Patch] `jest-e2e-setup.ts`'s `??=` wouldn't override an already-set empty string —
  fixed in both services with an explicit falsy check.
- [x] [Review][Patch] No test that `env.validation.ts`'s Joi constraints are actually live — fixed,
  added `env.validation.spec.ts`.
- [x] [Review][Patch] Issuer/JWKS-drift deferred-work entry only mentioned two languages — fixed,
  appended a note for the third (`people-service`).
- [x] [Review][Patch] Same-audience-at-every-hop tradeoff was an unwritten design decision — logged
  to `deferred-work.md` as a named boundary for future adopters.
- [x] [Review][Patch] `auth/` module now byte-for-byte duplicated across two services — logged to
  `deferred-work.md`, recommending a shared `libs/auth` once a third service adopts the pattern.
- [x] [Review][Defer] `UnavailableRelationshipPermissionAdapter` rejects with 401 instead of 403,
  making "not authenticated" and "not authorized" indistinguishable by status code — blocked by
  this spec's own frozen boundary (no touching that file); logged to `deferred-work.md` for
  Story 1.4.
- [x] [Review][Defer] No end-to-end wrong-issuer/wrong-audience test — logged, same
  disproportionate-effort reasoning as the BFF slice's identical, already-existing entry.

## Verification

**Commands:**
- `cd services/people-service && npm install && npm run build && npm run lint` — expected: clean
- `cd services/people-service && npm test` — expected: unit tests pass
- `cd services/people-service && npm run test:e2e -- jwt-guard` — expected: the new Testcontainers-Keycloak
  suite passes (Docker required); do not run the full `test:e2e` suite without a real Postgres up

**Actual result:** Build/lint clean for both `people-service` and `bff`. `people-service`: 68/68
unit tests, 6/6 e2e tests. `bff`: 17/17 unit tests, 9/9 e2e tests. All verified independently, not
just by the implementing agent.
