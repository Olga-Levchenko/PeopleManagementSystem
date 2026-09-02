---
title: 'Story 1.6: Server-assembled, section-gated profile response (Self/Reporting/Project/Colleague, S1+S2)'
type: 'feature'
created: '2026-09-02'
status: 'in-review'
review_loop_iteration: 1
baseline_commit: 'a03e59a29562f8b8b936c5e6c1c3ca2e4df4fb6d'
context:
  - '{project-root}/.claude/rules/access-control-invariants.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `people-service` has no profile-read endpoint at all, and no section-gating exists anywhere in the data-serving path — every section a viewer isn't entitled to must be structurally absent from the response, never a hint or a null.

**Approach:** Add `GET /api/v1/people/:subjectPersonId/profile` to `people-service`, backed by two new Person fields groups (S1 identity-card, S2 personal contacts) and a new `AccessRoleResolutionPort` calling `access-control-service`'s existing `GET /api/v1/access-roles/resolve`. Resolve the viewer's audience (Self / Reporting-line / Project-line / Colleague) and include only the sections/fields that audience is entitled to, per `docs/access-control/section-matrix.md`'s S1/S2 rows.

## Boundaries & Constraints

**Always:**
- `subjectPersonId === viewerPersonId` (from `RequestActorContext.actorId`) short-circuits to Self *before* calling access-control-service — never call the resolver for a person against themselves.
- Otherwise call `AccessRoleResolutionPort.resolve`; `reportingLine || projectLine` → Manager audience, gated per the returned `managerSectionAccess.s1`/`.s2` levels (`None` → omit, `Read`/`ReadWrite` → include full section). Neither line true, or the resolver call fails (network error, non-2xx) → Colleague (S1 only). Fail-closed to the least-privileged audience, matching `EfRelationshipRepository`'s existing "unknown id → no access" precedent.
- A section the resolved audience has no access to is **omitted from the response object entirely** — never `s2: null`, never an empty `{}`.
- Manager and People Partner are always included in S1 as `{id, fullName}` (or `null`) for every audience that gets S1 at all, including Colleague — this is existing FK data (`Person.managerId`/`peoplePartnerId`), not new access-role resolution.

**Ask First:** None anticipated.

**Never:**
- No mentor field (no data model exists; deferred to `deferred-work.md`), no "current project(s)" field (no project data synced into `people-service` yet; deferred), no PP-as-audience resolution (deferred — a real PP relationship resolves as Colleague under this slice, which is access-restrictive, not access-granting, so it fails safe), no Full-profile-access audience (Story 1.5, backlog), no S1-write-rejection endpoint (AC3 — deferred, no general S1 write path exists anywhere yet). Do not build any of these; do not add a write path of any kind — this endpoint is GET-only.
- Do not add `@nestjs/axios`/`axios`/`nock` — use native `fetch` (Node 22 global) for the outbound call; this is the first cross-service HTTP call in `people-service`, keep it dependency-free.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Self | viewerPersonId == subjectPersonId | `{s1: {...full...}, s2: {...full...}}` | N/A |
| Reporting line | resolver returns `reportingLine: true`, `managerSectionAccess.s1.level: "ReadWrite"`, `.s2.level: "Read"` | `s1` and `s2` both present | N/A |
| Project line only, narrowed | resolver returns `projectLine: true`, `managerSectionAccess.s2.level: "None"` | `s1` present, `s2` key absent | N/A |
| Colleague | resolver returns `reportingLine: false, projectLine: false` | only `s1` present (whitelist), `s2` absent | N/A |
| Resolver unreachable | fetch throws / non-2xx from access-control-service | treated as Colleague (fail-closed), request still succeeds with S1-only | logged, not surfaced as 5xx |
| Unknown subjectPersonId | no `Person` row matches `subjectPersonId` | 404 | `NotFoundException` |

</frozen-after-approval>

## Code Map

- `services/people-service/prisma/schema.prisma:36-50` — `Person` model: add `fullName String`, `photoUrl String?`, `position String?`, `countryCity String?`, `workEmail String?`, `workPhone String?`, `birthdayMonth Int?`, `birthdayDay Int?`, `startDate DateTime?`, `personalPhone String?`, `personalEmail String?`, `residentialAddress String?`. `Department` model (line 52-60): add `name String?`. Run `npm run db:migrate`.
- `services/access-control-service/src/AccessControlService.Api/Controllers/AccessRolesController.cs:41-58,91-137` — reference only: exact response shape to call and parse (`reportingLine`, `projectLine`, `managerSectionAccess.s1.level` etc., camelCase JSON, `Level` is `"None"|"Read"|"ReadWrite"`, whole `managerSectionAccess` key is `null` when neither line qualifies).
- `services/people-service/src/modules/organisational-relationships/organisational-relationships.ports.ts` — pattern to mirror: interface + `Injectable` adapter, `@Inject('TokenString')` in the consuming service.
- `services/people-service/src/modules/organisational-relationships/request-actor.context.ts` — reuse as-is (add as its own provider in the new module; no cross-module import needed, it only depends on `REQUEST`).
- `services/people-service/src/modules/organisational-relationships/organisational-relationships.controller.ts` — controller shape to mirror (`@ApiBearerAuth()`, `ParseUUIDPipe`, thin delegation).
- `services/people-service/src/prisma/prisma.service.ts` — inject via `PrismaService` (global module, no import needed).
- `services/people-service/src/config/env.validation.ts:1-31` — add `ACCESS_CONTROL_SERVICE_BASE_URL: Joi.string().uri().required()` (no default, same reasoning as `KEYCLOAK_BASE_URL`).
- `services/people-service/.env.example` — add `ACCESS_CONTROL_SERVICE_BASE_URL`.
- `services/people-service/test/jwt-guard.e2e-spec.ts` — pattern to mirror for e2e: override a provider directly on the compiled testing module rather than mocking HTTP wire format.

## Tasks & Acceptance

**Execution:**
- [x] `services/people-service/prisma/schema.prisma` -- add S1/S2 fields to `Person`, `name` to `Department` -- backing data for the profile response
- [x] `services/people-service/prisma/migrations/` (generated) -- `npm run db:migrate` -- commit the migration
- [x] `services/people-service/src/modules/profile/profile.ports.ts` -- `AccessRoleResolutionPort` interface + `HttpAccessRoleResolutionAdapter` (native `fetch`, catches network/non-2xx and returns the "neither line" shape) -- isolates the new outbound call behind a fake-able seam, mirroring `RelationshipPermissionPort`
- [x] `services/people-service/src/modules/profile/profile.service.ts` -- Self short-circuit, resolver call, section assembly per the I/O matrix -- core logic
- [x] `services/people-service/src/modules/profile/profile.controller.ts` -- `GET /api/v1/people/:subjectPersonId/profile`, `@ApiBearerAuth()` -- thin delegation
- [x] `services/people-service/src/modules/profile/profile.module.ts` -- wire controller/service/ports/`RequestActorContext`, register in `app.module.ts`
- [x] `services/people-service/src/config/env.validation.ts`, `.env.example` -- new required env var
- [x] `services/people-service/src/modules/profile/__tests__/profile.service.spec.ts` -- one case per I/O-matrix row, using a fake `AccessRoleResolutionPort`
- [x] `services/people-service/src/modules/profile/__tests__/http-access-role-resolution.adapter.spec.ts` -- mocks `global.fetch` (success, non-2xx, network throw)
- [x] `services/people-service/test/profile.e2e-spec.ts` -- real Postgres (Testcontainers per this service's pattern), `AccessRoleResolutionPort` overridden via `overrideProvider`, asserts the actual JSON has no `s2` key (not `null`) when narrowed/colleague
- [x] `services/people-service/CLAUDE.md` -- document the new `profile` module and env var

**Acceptance Criteria:**
- Given a Colleague-resolved viewer, when they request a subject's profile, then the response body has no `s2` key at all (asserted via `Object.keys`, not a null check)
- Given a Project-line-only viewer, when they request a subject's profile, then `s1` is present and `s2` is absent, matching `managerSectionAccess.s2.level: "None"`
- Given any viewer who gets S1 at all, when they view the response, then `s1.manager` and `s1.peoplePartner` are present as read-only `{id, fullName}` objects sourced from existing FK data
- Given access-control-service is unreachable, when a non-Self profile is requested, then the request still succeeds, resolved as Colleague, not a 5xx

## Spec Change Log

- [Review][Patch] `ProfileService.getProfile`'s section-inclusion check used a denylist (`level !== 'None'`), which fails *open* (grants) on any unrecognized `level` value from access-control-service (wire-shape drift, a future level, a malformed response) — the opposite of `access-control-invariants.md`'s fail-closed requirement. Fixed to an explicit allowlist (`level === 'Read' || level === 'ReadWrite'`), which fails *closed* on anything unrecognized. Added a regression test (`profile.service.spec.ts`: "unrecognized level string from access-control-service fails closed"). [services/people-service/src/modules/profile/profile.service.ts:108-124] — found by the mandatory access-control-reviewer pass, confirmed exploitable only in principle (today's real access-control-service always emits a recognized value), not in current production behavior.
- [Review][Defer] No automated contract test proves `HttpAccessRoleResolutionAdapter` parses access-control-service's *real* serialized JSON — both the adapter's own unit test and the e2e port override use a hand-authored literal matching the TS interface, not a captured/derived real response. Shapes verified to match today by manual cross-file inspection only. Logged to `deferred-work.md` rather than fixed here (would require cross-service Testcontainers orchestration, disproportionate to this slice).
- [Review][Defer] `RequestActorContext.actorId` (raw Keycloak `sub`) is used as a `Person.id` with no mapping column anywhere in the schema — confirmed pre-existing since Story 1.11c (`organisational-relationships.service.ts` makes the same assumption), not introduced by this story. Fails access-restrictive (Self never matches a real user, falls through to Colleague-safe resolution), not a leak. Logged to `deferred-work.md`.
- [Review][Defer] `profile.e2e-spec.ts` is not wired into CI (`people-service-ci.yml` doesn't set `run_e2e: true`) — pre-existing gap from Story 1.11c's `jwt-guard.e2e-spec.ts`, now also covers this story's e2e suite. Both e2e files are self-contained (Testcontainers) and CI-safe on their own; the blocker is `app.e2e-spec.ts`'s real-Postgres dependency in the same `npm run test:e2e` invocation. Logged to `deferred-work.md` (amended the existing 1.11c entry).

## Design Notes

**Known, accepted gap:** this slice cannot distinguish an actual assigned People Partner from a Colleague (PP-as-audience resolution doesn't exist anywhere yet — tracked in `deferred-work.md`). A real PP viewing their assignee's profile today gets Colleague-level access under this endpoint, which under-grants rather than over-grants — safe per `access-control-invariants.md`, but must be closed before Story 1.6 can be marked fully `done`.

`Person.fullName` is being introduced as non-nullable in the schema but the migration cannot backfill real names for any existing seeded rows — if `FixtureSeedData`-equivalent seed rows exist in `people-service`, give them fixture-appropriate pseudonymised names in the same migration/seed pass; do not leave the column nullable purely to dodge this (empty names would make every test assertion on `s1.fullName` meaningless).

## Verification

**Commands:**
- `cd services/people-service && npm run db:migrate` -- expected: new migration applies cleanly
- `cd services/people-service && npm run build` -- expected: clean build
- `cd services/people-service && npm test` -- expected: all unit tests pass, including new `profile` specs
- `cd services/people-service && npm run test:e2e` -- expected: `profile.e2e-spec.ts` passes against real Postgres (Testcontainers)
- `cd services/people-service && npm run lint` -- expected: no lint errors
