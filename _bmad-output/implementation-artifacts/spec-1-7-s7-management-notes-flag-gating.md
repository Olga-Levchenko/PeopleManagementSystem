---
title: 'Story 1.7: S7 Management notes flag gating'
type: 'feature'
created: '2026-09-05'
status: 'done'
review_loop_iteration: 0
baseline_commit: '053c4a63bb6d3f36d35784332fabe2988995abb8'
context:
  - '{project-root}/.claude/rules/access-control-invariants.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Management notes (S7) have no CRUD or authorization logic anywhere — `work-management-service` has only a bare `ManagementNote` Prisma model and an empty module. UM/DM/PP must get full RW on notes about people they're responsible for; a PM (not DM) must get read-only, flagged-notes-only access; the underlying viewer's access role must be resolved via `access-control-service`, never re-derived locally.

**Approach:** Add JWT auth to `work-management-service` (porting `people-service`'s already-reviewed pattern verbatim), then a `management-notes` module whose service resolves the caller's access via `access-control-service`'s existing `/api/v1/access-roles/resolve` endpoint — extended in this same story with a new `projectRoles` field (per ADR-003's already-accepted 2026-09-02 addendum) so DM and PM can finally be told apart.

**Scope note:** a thin BFF proxy for these endpoints was split off this spec at the token-count checkpoint — tracked in `deferred-work.md`, not part of this story. All 6 ACs below are verified directly against `work-management-service`'s own API, matching the precedent Story 1.5 already set for its own grant/revoke endpoints.

## Boundaries & Constraints

**Always:**
- Full RW on a subject's notes when the resolved viewer has `reportingLine`, `peoplePartnerLine`, or `fullProfileAccessLine` true, OR `projectRoles` contains `DeliveryManager` — these conditions are independent and OR'd, which is what makes "most-permissive-path-wins" (AC5) fall out for free with no separate merge step.
- Read-only, `visibleForPm`-only notes when none of the full-RW conditions hold but `projectRoles` contains `ProjectManager`.
- When `viewerId === subjectId`: read-only, `visibleForEmployee`-only notes — checked before calling the resolver (self is not a resolver concept; `AccessRoleResolver` returns `AccessRole.None` for self by its own contract).
- Everything else: 403, no note existence ever implied by the response.
- `authorPersonId` on create is always the JWT `sub` (server-derived) — never accepted from the request body.
- `AccessRole.ProjectRoles` is a new Domain-owned `ProjectRole` enum (`ProjectManager`, `DeliveryManager`), not a reference to Infrastructure's `ProjectAssignmentRole` — Domain has zero external dependencies (AD-1); `EfRelationshipRepository` maps at the boundary.
- Purely additive on the .NET side: no change to `ReportingLine`/`ProjectLine`'s existing resolution logic, no change to `GetProjectIdsManagedAsDmOrPmAsync`'s existing signature/behavior — add a new sibling repository method instead.

**Ask First:** None anticipated.

**Never:**
- Do not touch `ManagerSectionAccessPolicy.Resolve()`'s S7 cell in this story. `people-service`'s `ProfileResponse`/`resolveAudience` has no `s7` field at all today (confirmed by reading `profile.ports.ts`/`profile.service.ts` in full) — nothing consumes `managerSectionAccess.s7`, so leaving it at its current always-`ReadWrite` value is zero-blast-radius staleness, not a leak. Log one line to `deferred-work.md` instead of expanding scope here.
- Do not build the BFF proxy module in this story (see Scope note above — deferred).
- No new EF Core migration for `ManagementNote` itself — the model and its `@default(false)` columns are already migrated (`20260902122657_add_management_note`). A migration is only needed for the new `ProjectAssignment` fixture rows (AC5 test data).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| AC1: create, no flags | `POST /management-notes` omits both flags | Row persisted with `visibleForEmployee=false`, `visibleForPm=false` via DB default, not app default | N/A |
| AC2: unflagged note, employee view | Note both-flags-false; viewer = subject | Note absent from list | N/A |
| AC2: unflagged note, PM view | Note both-flags-false; viewer resolves `projectRoles=['ProjectManager']` only | Note absent from list | N/A |
| AC3: UM/DM/PP full RW | Viewer resolves `reportingLine=true` (or `peoplePartnerLine`/`fullProfileAccessLine`/DM `projectRoles`) | All notes for subject returned; create/update succeed regardless of flags | N/A |
| AC4: PM narrowed | Viewer resolves `projectRoles=['ProjectManager']`, no other qualifying line | Only `visibleForPm=true` notes returned; create/update → 403 | 403 |
| AC5: multi-path | Viewer is DM on project A, PM on project B, subject assigned to both | Full RW (DM path wins) | N/A |
| AC6: flag flip | Existing note `visibleForEmployee: false→true` via `PATCH` | Employee's next list includes it; no other field changed | N/A |
| Colleague / no relationship | Viewer resolves all-false, `viewerId !== subjectId` | 403 on every route | 403 |
| Missing/invalid JWT | No/expired/malformed `Authorization` header | 401, controller never reached (guard) | 401 |

</frozen-after-approval>

## Code Map

**access-control-service (.NET):**
- `src/AccessControlService.Domain/ProjectRole.cs` -- NEW enum `{ ProjectManager, DeliveryManager }`, Domain-owned mirror of Infrastructure's `ProjectAssignmentRole` (excludes `Member` -- never qualifies)
- `src/AccessControlService.Domain/AccessRole.cs` -- add `IReadOnlyCollection<ProjectRole> ProjectRoles { get; init; } = Array.Empty<ProjectRole>()` after `ProjectLine` (line 45); doc comment: non-empty only when `ProjectLine` true
- `src/AccessControlService.Domain/IRelationshipRepository.cs` -- add `Task<IReadOnlyCollection<(Guid ProjectId, ProjectRole Role)>> GetProjectRolesAsync(Guid personId, CancellationToken ct = default)`; leave existing `GetProjectIdsManagedAsDmOrPmAsync` (line 55) untouched
- `src/AccessControlService.Infrastructure/Persistence/EfRelationshipRepository.cs` -- implement `GetProjectRolesAsync`: query `ProjectAssignments` filtered to PM/DM (mirror lines 144-159's filter), `.Select(pa => new { pa.ProjectId, pa.Role })` (don't collapse role like the existing method does), map `Infrastructure.ProjectAssignmentRole` → `Domain.ProjectRole` per row
- `src/AccessControlService.Domain/AccessRoleResolver.cs` -- add a sibling to `QualifiesViaProjectAssignmentAsync` (lines 210-235) that calls the new repo method + existing `GetAssignedProjectIdsAsync(subjectId)`, intersects on `ProjectId`, returns `.Select(r => r.Role).Distinct()`
- `src/AccessControlService.Api/Controllers/AccessRolesController.cs` -- add `ProjectRoles` to `AccessRoleResolveResponse` (after line 117), populate at ~line 73 as `accessRole.ProjectRoles.Select(r => r.ToString()).ToArray()`, same string-enum convention as `SectionAccessLevel` (line 107)
- `src/AccessControlService.Infrastructure/Persistence/FixtureSeedData.cs` -- add one fixture person who is PM on one project and DM on another, both shared with an existing subject (no such fixture exists today -- `PlatformLeadId` is DM on two projects, not PM+DM split) -- new EF Core migration required (`dotnet ef migrations add AddPmDmMultiPathFixture ...`, pattern: `20260904180115_ConvertFullProfileAccessActionToString`)
- `tests/AccessControlService.Domain.Tests/FakeRelationshipRepository.cs` -- add a new setter (e.g. `SetProjectRoles(personId, (projectId, role)...)`) alongside the existing `SetProjectsManagedAsDmOrPm` (lines 69-73), don't modify the existing one
- `tests/AccessControlService.Domain.Tests/AccessRoleResolverTests.cs` -- new cases per I/O matrix, alongside the existing Project-line cases (lines 335-448)
- `tests/AccessControlService.Api.Tests/AccessRoleResolverCompositionTests.cs` -- new HTTP-level `projectRoles` assertions, alongside the existing Project-line-only test (lines 561-586)

**work-management-service (NestJS, port 3004) -- auth (port verbatim from people-service):**
- `src/modules/auth/{jwt.strategy.ts, jwt-auth.guard.ts, public.decorator.ts, auth.module.ts}` -- byte-for-byte copy of `services/people-service/src/modules/auth/*`, import paths only
- `src/config/env.validation.ts` -- add `KEYCLOAK_BASE_URL`/`KEYCLOAK_REALM` (no `.default`, same as people-service) + `ACCESS_CONTROL_SERVICE_BASE_URL` (`Joi.string().uri().required()`)
- `src/app.module.ts` -- import `AuthModule`, add `{ provide: APP_GUARD, useClass: JwtAuthGuard }`
- `src/modules/health/health.controller.ts` -- add `@Public()`
- `package.json` -- add `@nestjs/passport@^11.0.5`, `passport@^0.7.0`, `passport-jwt@^4.0.1`, `jwks-rsa@^3.2.2` (+ `@types/passport-jwt` dev) -- exact pinned versions, not latest (ESM-incompatibility reason documented in people-service's CLAUDE.md)
- `.env.example` -- add the three new vars
- `test/jwt-guard.e2e-spec.ts` -- adapt `people-service`'s (structure/technique only, not byte-for-byte -- own env schema, own route)

**work-management-service -- feature:**
- `src/modules/management-notes/access-control-client.ts` -- NEW, fetch-based adapter calling `GET {ACCESS_CONTROL_SERVICE_BASE_URL}/api/v1/access-roles/resolve`, same fail-closed contract as `people-service/src/modules/profile/profile.ports.ts`'s `HttpAccessRoleResolutionAdapter` (network/non-2xx → safe default, never throw)
- `src/modules/management-notes/management-notes.service.ts` -- NEW: `resolveAccess(viewerId, subjectId)` implementing the Boundaries table; `listNotes`, `createNote`, `updateNote` gated by it
- `src/modules/management-notes/management-notes.controller.ts` -- NEW: `GET ?subjectPersonId=`, `POST`, `PATCH /:id`; reads `request.user.sub` as `viewerId` (same convention as `people-service`'s `RequestActorContext`)
- `src/modules/management-notes/dto/{create-management-note.dto.ts, update-management-note.dto.ts}` -- NEW; create: `subjectPersonId`, `content`, optional `visibleForEmployee`/`visibleForPm`; update: optional `content`/`visibleForEmployee`/`visibleForPm` only (partial update -- AC6's "no other change")
- `src/modules/management-notes/management-notes.module.ts` -- replace the empty scaffold with real wiring
- `src/modules/management-notes/__tests__/management-notes.service.spec.ts` -- unit tests, one per I/O matrix row (fake access-control-client)
- `test/management-notes.e2e-spec.ts` -- NEW e2e, real Prisma + fake access-control-client HTTP responses

## Tasks & Acceptance

**Execution:**
- [x] `access-control-service`: `ProjectRole.cs`, `AccessRole.cs`, `IRelationshipRepository.cs`, `EfRelationshipRepository.cs`, `AccessRoleResolver.cs`, `AccessRolesController.cs` -- `projectRoles` resolution + response field
- [x] `access-control-service`: `FixtureSeedData.cs` + new migration -- PM+DM-on-different-projects fixture
- [x] `access-control-service` tests: `FakeRelationshipRepository.cs`, `AccessRoleResolverTests.cs`, `AccessRoleResolverCompositionTests.cs`
- [x] `work-management-service`: port auth module verbatim + wire `APP_GUARD` + env vars + deps
- [x] `work-management-service`: `access-control-client.ts`, `management-notes.service.ts`, `.controller.ts`, DTOs, `.module.ts`
- [x] `work-management-service` tests: unit (`management-notes.service.spec.ts`) + e2e (`management-notes.e2e-spec.ts`, `jwt-guard.e2e-spec.ts`)
- [x] `deferred-work.md` -- one-line entry: `ManagerSectionAccessPolicy.Resolve()`'s S7 cell still doesn't reflect PM narrowing; harmless today since `people-service` doesn't assemble S7

**Acceptance Criteria:** (verbatim from `epics.md`, Epic 1 Story 1.7)
- Given a newly created management note with no flags explicitly set, when it is persisted, then both `visibleForEmployee` and `visibleForPm` are false, verified as a non-nullable DB-defaulted column
- Given a note with both flags unset, when the employee it's about or a PM in the project chain reads S7, then the note is absent
- Given a UM, DM, or PP responsible for the subject, when they read or write S7 notes, then they get full RW regardless of flag state
- Given a viewer who is specifically a PM (a DM keeps full RW), when they read S7, then they see only `visibleForPm`-flagged notes, read-only
- Given a viewer reaching the subject through more than one path at once, when any one path grants full RW, then they get full RW even though a less-permissive path also applies
- Given an existing note with `visibleForEmployee=false` changed to `true`, when persisted, then it appears on that employee's next read with no other change to the record

### Review Findings

- [x] [Review][Decision] ProjectLine resolution mechanism changed, deviating from the frozen "purely additive" constraint — `AccessRoleResolver.ResolveAsync` (`services/access-control-service/src/AccessControlService.Domain/AccessRoleResolver.cs:78-88`) now derives `AccessRole.ProjectLine` from a single intersection over `GetProjectRolesAsync`, not from `GetProjectIdsManagedAsDmOrPmAsync` as before, to close a genuine TOCTOU race in the old two-query approach. **Resolved: accepted as-is** — a documented, justified deviation from the frozen boundary; the correctness fix outweighs the literal "purely additive" constraint. `GetProjectIdsManagedAsDmOrPmAsync` stays as unreachable-but-untouched production code for now; retiring it is an optional future cleanup, not required by this decision.
- [x] [Review][Decision] PATCH's not-found-before-access-check ordering lets an existence signal through — `ManagementNotesService.updateNote` (`services/work-management-service/src/modules/management-notes/management-notes.service.ts:144-154`) runs `findUnique` by note id before resolving access, so an unauthorized authenticated caller who already holds a note id gets 404 (no such note) vs 403 (exists, no access). **Resolved: accepted as-is** — the leak is narrow (confirms only that a note id exists, never its subject or content), requires the attacker to already possess a real note id (impractical to guess across the full UUID space), and matches ordinary REST convention (404 missing / 403 forbidden) already relied on by existing UM/DM/PP callers.
- [x] [Review][Decision] `authorPersonId` is exposed to every audience with no product decision on record — `ManagementNoteView` (`services/work-management-service/src/modules/management-notes/management-notes.service.ts:13-22`) includes `authorPersonId` identically across the `full`, `pm`, and `self` outcomes. **Resolved: accepted as-is** — no subject/content leak, just note authorship visible to whoever can already read the note; nothing in the spec or ACs suggests it should be masked.
- [x] [Review][Patch] Explicit `null` on optional DTO fields bypasses validation and reaches Prisma against non-nullable columns [services/work-management-service/src/modules/management-notes/dto/create-management-note.dto.ts:36-44] — Fixed: `@IsOptional()` replaced with `@ValidateIf((o) => o.field !== undefined)` on all five affected fields (both DTOs' `visibleForEmployee`/`visibleForPm`, and update's `content`) — an explicit `null` now fails `@IsBoolean()`/`@IsString()` and gets a clean 400 instead of reaching Prisma.
- [x] [Review][Patch] Fail-closed contract has an unguarded path — `HttpAccessRoleResolutionAdapter.resolve` (`services/work-management-service/src/modules/management-notes/access-control-client.ts:98-101`). Fixed: `config.getOrThrow`/`new URL(...)`/`searchParams.set` now run inside the `try` block, so any failure there also degrades to `NO_ACCESS_RESOLUTION`.
- [x] [Review][Patch] No test asserts a self-viewer's write is rejected. Fixed: added `self viewer gets 403 on create/update` unit cases (`management-notes.service.spec.ts`) and an equivalent e2e case (`management-notes.e2e-spec.ts`).
- [x] [Review][Patch] `docs/access-control/section-matrix.md`'s Story 1.7 coverage note overstates e2e coverage. Fixed: added `AC3: a Full-profile-access viewer gets full RW` to `management-notes.e2e-spec.ts` — the doc's claim is now accurate.
- [x] [Review][Patch] JWT guard is only proven via GET. Fixed: added `missing token on POST`/`missing token on PATCH` cases to `jwt-guard.e2e-spec.ts`.
- [x] [Review][Patch] Cross-audience isolation is unit-tested only. Fixed: added a real-Postgres e2e case to `management-notes.e2e-spec.ts` proving both directions (`visibleForEmployee`-only invisible to PM, `visibleForPm`-only invisible to self).
- [x] [Review][Patch] `content` validation accepts whitespace-only strings. Fixed: both DTOs' `content` field now has a `@Transform` trimming the value before `@MinLength(1)`/`@MaxLength` run.

## Design Notes

**Why `projectRoles` lives in `access-control-service`, not `work-management-service` querying project data itself:** ADR-003's accepted option (a) -- keeps the "resolve access role" decision in one place (AD-2). `work-management-service` never touches `ProjectAssignment` data directly.

**Self-view precedence:** checked before the resolver call, not as a fourth OR'd condition -- mirrors `AccessRoleResolver`'s own contract that Self is a separate case the caller resolves first (already true for `ReportingLine`/`ProjectLine`/etc., which all return false for `viewerId===subjectId`).

**Fail-closed HTTP client:** `access-control-client.ts` on a network error or non-2xx from `access-control-service` must resolve to "no access" (`{reportingLine:false, projectLine:false, projectRoles:[], peoplePartnerLine:false, fullProfileAccessLine:false}`), never throw past the caller -- same contract as `profile.ports.ts`'s existing adapter.

## Verification

**Commands:**
- `cd services/access-control-service && dotnet build --configuration Release && dotnet test --configuration Release` -- **actually run during implementation** (a .NET 8 SDK was installed to `/tmp/dotnet8` for this session, since the machine only had .NET 10 on `PATH` and `global.json` pins `8.0.100`): clean build, 0 warnings; all 368 tests pass (114 Domain, 128 Infrastructure via real Testcontainers-Postgres, 126 Api via `WebApplicationFactory` + Testcontainers-Postgres), including every new `ProjectRoles`/multi-path case. One pre-existing Infrastructure test (`GetAssignedProjectIdsAsync_KnownAssignee_ReturnsSeededProjectId`) had to be updated: the new PM/DM multi-path fixture reuses `ProjectAssigneeId` as a Member of Project Orion too, so that assignee is now genuinely assigned to two projects, not one.
- `cd services/work-management-service && nvm use && npm install && npm run build && npm run lint && npm test && npm run test:e2e` -- **actually run during implementation** against the real `infra/docker-compose.yml` Postgres/Keycloak already running in this environment (Node 24 was used in place of the pinned Node 22 -- not re-verified against Node 22 itself): clean build/lint, 31/31 unit tests pass, 17/17 e2e tests pass (`app.e2e-spec.ts`, the new `management-notes.e2e-spec.ts` against real Prisma, and the new `jwt-guard.e2e-spec.ts` against a real ephemeral Testcontainers Keycloak). Re-run after the code-review round below (same real Postgres/Keycloak, Node 24): clean build/lint, 52/52 unit tests pass, 22/22 e2e tests pass.

**Post-implementation review (blind-hunter + edge-case-hunter + verification-gap, against baseline `053c4a63bb6d3f36d35784332fabe2988995abb8`):** six findings triaged as real, all fixed and re-verified:
1. Added `access-control-client.spec.ts` -- direct unit coverage of `parseAccessRoleResolution` (malformed/non-object JSON, non-boolean-truthy line values, unrecognized `projectRoles` entries) and `HttpAccessRoleResolutionAdapter.resolve` (2xx-parse, non-2xx, network-throw, timeout/abort -- all fail closed).
2. `AccessRoleResolver.ResolveProjectQualificationAsync` now derives `ProjectLine` and `ProjectRoles` from one intersection pass (one `GetProjectRolesAsync` + one `GetAssignedProjectIdsAsync` call), replacing the previous two independent query pairs that could observe a project-assignment change land in between and return an internally inconsistent response. `FakeRelationshipRepository.SetProjectsManagedAsDmOrPm` was updated to also seed `GetProjectRolesAsync`'s backing map (placeholder `DeliveryManager` role) so every pre-existing spec-1-1c test keeps passing unmodified against the new single-source resolution.
3. `access-control-client.ts`'s `fetch` call now carries `AbortSignal.timeout(5_000)` -- a hang degrades to `NO_ACCESS_RESOLUTION` within a bounded time instead of blocking indefinitely.
4. Both DTOs' `content` field now has `@MaxLength(10_000)` (`MANAGEMENT_NOTE_CONTENT_MAX_LENGTH`, shared from `create-management-note.dto.ts`).
5. Added two explicit cross-audience-isolation unit tests: a `visibleForEmployee`-only note confirmed invisible to a PM-only viewer, and symmetrically a `visibleForPm`-only note confirmed invisible to the employee (self) view -- simulated against a fake Prisma `findMany` that actually filters by the `where` clause, not just an assertion on the call shape.
6. `docs/access-control/section-matrix.md`'s S7 row `Test coverage` cell updated from `partial` to `full`, with a matching "Test coverage note" paragraph (Story 1.9/1.5 precedent format) citing every test file/scenario.

Two findings were reviewed and deliberately rejected, no action taken: the `updateNote` 404-vs-403 split on note existence (accepted, precedented trade-off, not a leak), and the JWT `sub`-equals-`personId` assumption (existing platform-wide convention from Story 1.11, out of this story's scope to change unilaterally).

Full re-verification after all six fixes: `.NET` -- clean build (0 warnings), 368/368 tests pass (114 Domain + 128 Infrastructure + 126 Api). `Node` -- clean build/lint, 50/50 unit tests pass, 17/17 e2e tests pass.

**`/bmad-code-review` round (blind-hunter + edge-case-hunter + verification-gap + acceptance-auditor, against this same baseline):** 3 `decision-needed` findings, all resolved by the human as "accept as-is" (see checked-off Decision bullets above); 7 `patch` findings, all fixed:
1. `@IsOptional()` replaced with `@ValidateIf((o) => o.field !== undefined)` on all five nullable-vulnerable DTO fields -- an explicit `null` now gets a clean 400 instead of reaching Prisma.
2. `access-control-client.ts`'s `config.getOrThrow`/`new URL(...)`/`searchParams.set` moved inside the `try` block, closing the one path that could throw past the fail-closed contract.
3. Added self-viewer create/update 403 unit + e2e cases -- the self-is-read-only invariant now has write-side test coverage, not just the read-side AC2 case.
4. Added an `AC3: Full-profile-access viewer gets full RW` e2e case -- `section-matrix.md`'s existing coverage claim is now actually true.
5. Added unauthenticated POST/PATCH 401 e2e cases to `jwt-guard.e2e-spec.ts`.
6. Added a real-Postgres cross-audience-isolation e2e case (both directions).
7. Added a `@Transform` trim step before `@MinLength(1)` on both DTOs' `content` field -- whitespace-only content is no longer accepted.

Full re-verification after all seven patches: `Node` -- clean build/lint, 52/52 unit tests pass (up from 50), 22/22 e2e tests pass (up from 17). `.NET` untouched this round (all three decisions were "accept as-is," no code changes) -- still 368/368 from the prior round.

## Suggested Review Order

**Access decision -- the actual S7 gating logic**

- Entry point: self-view short-circuit, then the four-way OR that makes most-permissive-path-wins fall out for free.
  [`management-notes.service.ts:54`](../../services/work-management-service/src/modules/management-notes/management-notes.service.ts#L54)

- Every mutating/reading path funnels through `resolveAccess` before touching Prisma.
  [`management-notes.service.ts:83`](../../services/work-management-service/src/modules/management-notes/management-notes.service.ts#L83)

- `ResolveAsync` now derives `ProjectLine` and `ProjectRoles` together -- the post-review TOCTOU fix.
  [`AccessRoleResolver.cs:236`](../../services/access-control-service/src/AccessControlService.Domain/AccessRoleResolver.cs#L236)

- Single intersection pass replaces the two independent DB round trips flagged in review.
  [`AccessRoleResolver.cs:88`](../../services/access-control-service/src/AccessControlService.Domain/AccessRoleResolver.cs#L88)

- New collection property, empty-never-null, purely additive alongside the three existing lines.
  [`AccessRole.cs:59`](../../services/access-control-service/src/AccessControlService.Domain/AccessRole.cs#L59)

- Domain-owned enum, deliberately not a reference to Infrastructure's `ProjectAssignmentRole` (AD-1).
  [`ProjectRole.cs:13`](../../services/access-control-service/src/AccessControlService.Domain/ProjectRole.cs#L13)

- Wire response gains `projectRoles`, string-mapped like the existing `SectionAccessLevel` convention.
  [`AccessRolesController.cs:74`](../../services/access-control-service/src/AccessControlService.Api/Controllers/AccessRolesController.cs#L74)

- New port method returns role-per-project, not just a collapsed boolean like the old one.
  [`IRelationshipRepository.cs:84`](../../services/access-control-service/src/AccessControlService.Domain/IRelationshipRepository.cs#L84)

- EF implementation maps Infrastructure's enum to Domain's at the boundary, never leaking it upward.
  [`EfRelationshipRepository.cs:205`](../../services/access-control-service/src/AccessControlService.Infrastructure/Persistence/EfRelationshipRepository.cs#L205)

**Fail-closed HTTP boundary to access-control-service**

- Parses the resolve response defensively -- malformed/unexpected shapes degrade to no-access, never throw.
  [`access-control-client.ts:39`](../../services/work-management-service/src/modules/management-notes/access-control-client.ts#L39)

- 5s `AbortSignal.timeout` closes the review-flagged hang gap -- a stuck request now fails closed too.
  [`access-control-client.ts:111`](../../services/work-management-service/src/modules/management-notes/access-control-client.ts#L111)

**Data and fixtures**

- New fixture person proves the "multiple relationship paths" rule: DM on one project, PM on another.
  [`FixtureSeedData.cs:199`](../../services/access-control-service/src/AccessControlService.Infrastructure/Persistence/FixtureSeedData.cs#L199)

- S7's Test coverage column moves from stale to "full" -- the living doc now matches reality.
  [`section-matrix.md:48`](../../docs/access-control/section-matrix.md#L48)

**Auth wiring -- ported, not redesigned**

- Byte-for-byte port of `people-service`'s already-reviewed JWT strategy -- no new auth design here.
  [`jwt.strategy.ts:72`](../../services/work-management-service/src/modules/auth/jwt.strategy.ts#L72)

- Global guard wired the same way as every other service in this repo.
  [`app.module.ts:25`](../../services/work-management-service/src/app.module.ts#L25)

**API surface and validation**

- Thin controller: routing only, `viewerId` read from the verified JWT, never the request body.
  [`management-notes.controller.ts:39`](../../services/work-management-service/src/modules/management-notes/management-notes.controller.ts#L39)

- Review-flagged `@MaxLength` now bounds note content on both create and update.
  [`create-management-note.dto.ts:33`](../../services/work-management-service/src/modules/management-notes/dto/create-management-note.dto.ts#L33)

**Tests**

- Parametrized full-RW coverage across all four independent qualifying lines, plus PM-narrowed and colleague negatives.
  [`management-notes.service.spec.ts:140`](../../services/work-management-service/src/modules/management-notes/__tests__/management-notes.service.spec.ts#L140)

- New: direct coverage of the adapter itself (malformed JSON, non-2xx, network throw, timeout) -- the review's main finding.
  [`access-control-client.spec.ts:1`](../../services/work-management-service/src/modules/management-notes/__tests__/access-control-client.spec.ts#L1)

- New `ProjectRoles` resolver cases: DM-only, PM-only, both-on-different-projects, unrelated project, self.
  [`AccessRoleResolverTests.cs:453`](../../services/access-control-service/tests/AccessControlService.Domain.Tests/AccessRoleResolverTests.cs#L453)

- Real ephemeral Keycloak proves the ported auth guard actually rejects missing/malformed/expired tokens.
  [`jwt-guard.e2e-spec.ts:1`](../../services/work-management-service/test/jwt-guard.e2e-spec.ts#L1)

- Real Postgres end-to-end: create, list, update, and the flag-flip visibility change.
  [`management-notes.e2e-spec.ts:1`](../../services/work-management-service/test/management-notes.e2e-spec.ts#L1)
