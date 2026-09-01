---
title: 'Story 1.2: Access role un-derives when a relationship ends'
type: 'feature'
created: '2026-08-31'
status: 'done'
review_loop_iteration: 1
baseline_commit: 'cb38ee7f953736caa42175f1217af5188874b6e0'
context:
  - '{project-root}/.claude/rules/access-control-invariants.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 1.1 shipped access-role resolution and the Project-line event-consumption pipeline, but nothing yet proves the epic's "no propagation delay, no cache lag" guarantee (this story's own AC) end-to-end, for either Reporting-line or Project-line — it's an implicit property of the current no-caching design, never asserted by test.

**Approach:** Add integration tests, against a real, DI-composed `AccessRoleResolver`/`EfRelationshipRepository` backed by real Postgres, proving that (a) a direct reports-to/department-management data change and (b) a project-assignment-revoke event are both reflected on the very next resolution call — no new production code, since `AccessRoleResolver`/`EfRelationshipRepository` already read live, uncached data on every call. Story 1.3's actual relationship-change screen doesn't exist yet, so "platform-owned edit" is exercised by mutating `AccessControlDbContext` data directly, not through a UI — the same substitution `EfRelationshipRepositoryTests` already uses for scenarios with no producing UI yet.

## Boundaries & Constraints

**Always:**
- Every new test uses the real, DI-composed `AccessRoleResolver` + `EfRelationshipRepository` against a real Postgres (Testcontainers), not the hand-written fake — this story is specifically about proving a real-infrastructure guarantee, and the fake trivially has no cache to disprove.
- A data mutation and its follow-up resolution happen sequentially on the same resolver instance (per `AccessRoleResolver`'s own sequential-only contract) — never `Task.WhenAll`.
- Project-line revocation goes through the real event-processing path (`ProjectAssignmentEventProcessor.ProcessAsync` with `IsGrant: false`), not a direct row delete — proving the actual consumer path un-derives access, not just that deleting a row would.

**Ask First:** None anticipated — this is test-only work against already-shipped, already-reviewed production code.

**Never:**
- No new caching layer, and no reflexive change to `AccessRoleResolver`/`EfRelationshipRepository`'s existing query logic — if a test fails, diagnose the actual cause first: fix the test if its assumptions were wrong, fix the resolver/repository if the failure reveals a real regression. Don't assume either side by default.
- No dependency on Story 1.3's relationship-change screen or Story 1.4's permission checks — those are separate, not-yet-built stories (ADR-002/ADR-003); this story tests the resolver/repository layer directly.
- No new project-assignment revocation *logic* — `ProjectAssignmentEventProcessor`'s revoke handling already ships (PR #14); this story adds the test proving it composes correctly with `AccessRoleResolver`'s next resolution, not new processor code.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Reports-to edit revokes | Viewer resolves `ReportingLine=true` via reports-to; `Person.ManagerId` is then changed away from the viewer directly in the DB | Next `ResolveAsync` call for the same (viewer, subject) pair returns `ReportingLine: false` | N/A |
| Department-management edit revokes | Viewer resolves `ReportingLine=true` via department management; the subject's `Person.DepartmentId` (or the department chain) changes such that the viewer no longer manages an ancestor | Next `ResolveAsync` call returns `ReportingLine: false` | N/A |
| Reports-to edit grants | Viewer does not resolve `ReportingLine`; `Person.ManagerId` is changed to establish a qualifying chain | Next `ResolveAsync` call returns `ReportingLine: true` — proves the guarantee isn't one-directional (revoke-only) | N/A |
| Project-assignment revoke event | Viewer resolves `ProjectLine=true` via a DM/PM assignment; a revoke event (`IsGrant: false`) for that assignment is processed | Next `ResolveAsync` call for the same pair returns `ProjectLine: false` | N/A |
| Same resolver instance, sequential calls | One `AccessRoleResolver` instance, two `ResolveAsync` calls in sequence (before/after mutation) | Second call's result differs correctly from the first — demonstrates no per-instance memoization exists | N/A |

</frozen-after-approval>

## Code Map

- `services/access-control-service/src/AccessControlService.Domain/AccessRoleResolver.cs` — read-only reference: confirms no caching field/logic exists to test against (`ResolveAsync` queries `_repository` fresh every call)
- `services/access-control-service/src/AccessControlService.Infrastructure/Persistence/EfRelationshipRepository.cs` — read-only reference: every lookup is `.AsNoTracking()`, no caching
- `services/access-control-service/src/AccessControlService.Infrastructure/Messaging/ProjectAssignmentEventProcessor.cs` — read-only reference: `ProcessAsync` with `IsGrant: false` removes the `ProjectAssignment` row (already shipped, PR #14)
- `services/access-control-service/tests/AccessControlService.Api.Tests/AccessRoleResolverCompositionTests.cs` — pattern to follow: real `WebApplicationFactory<Program>`-composed resolver/repository against Testcontainers Postgres; this story's new tests join the same file and its `[Collection("HealthEndpointTests")]`
- `services/access-control-service/src/AccessControlService.Infrastructure/Persistence/FixtureSeedData.cs` — reuse existing fixture ids (e.g. `EngineerId`/`PlatformLeadId`/`DirectorId`) for the reports-to/department scenarios; write directly to `AccessControlDbContext` for scenario-specific mutations, mirroring `EfRelationshipRepositoryTests.cs`'s test-local row pattern
- `services/access-control-service/tests/AccessControlService.Infrastructure.Tests/Messaging/ProjectAssignmentEventProcessorTests.cs` — pattern to follow for driving a real revoke event through `ProjectAssignmentEventProcessor.ProcessAsync`

## Tasks & Acceptance

**Execution:** (each test in `services/access-control-service/tests/AccessControlService.Api.Tests/AccessRoleResolverCompositionTests.cs`, against the real DI-composed resolver)
- [x] `ResolveAsync_ReportsToEditRevokesReportingLine_NextCallReflectsChangeImmediately` — matrix row: Reports-to edit revokes
- [x] `ResolveAsync_DepartmentManagementEditRevokesReportingLine_NextCallReflectsChangeImmediately` — matrix row: Department-management edit revokes
- [x] `ResolveAsync_ReportsToEditGrantsReportingLine_NextCallReflectsChangeImmediately` — matrix row: Reports-to edit grants
- [x] `ResolveAsync_ProjectAssignmentRevokeEvent_NextCallReflectsProjectLineAbsent` — matrix row: Project-assignment revoke event
- [x] `ResolveAsync_SameResolverInstanceSequentialCalls_TogglesGrantThenRevokeWithNoMemoization` — matrix row: Same resolver instance, sequential calls

**Acceptance Criteria:**
- Given a viewer resolving `ReportingLine=true` via reports-to, when `Person.ManagerId` is then changed away from the viewer directly in `AccessControlDbContext`, then the next `ResolveAsync` call for that (viewer, subject) pair returns `ReportingLine: false` with no propagation delay
- Given a viewer resolving `ReportingLine=true` via department management, when the subject's department chain changes such that the viewer no longer manages an ancestor, then the next `ResolveAsync` call returns `ReportingLine: false` with no propagation delay
- Given a viewer not resolving `ReportingLine`, when `Person.ManagerId` is changed to establish a qualifying reports-to chain, then the next `ResolveAsync` call returns `ReportingLine: true` — proving the guarantee isn't one-directional (revoke-only)
- Given a project-assignment-ended event processed through `ProjectAssignmentEventProcessor` (`IsGrant: false`), when the resolution engine's next `ResolveAsync` call runs, then Project-line access derived solely from that assignment is absent
- Given the same `AccessRoleResolver` instance used for a resolution both before and after an underlying data change, when the two calls are compared, then the second reflects the change — demonstrated by test, not assumed from the absence of a cache field

### Review Findings

- [x] [Review][Decision] Contradictory guidance on what to do if a test fails — resolved: diagnose the actual cause first (fix the test if its assumptions were wrong, fix the resolver/repository if it's a real regression), not a hardcoded default either way. Reconciled into the "Never" bullet and Design Notes.
- [x] [Review][Patch] Tasks & Acceptance section doesn't give 1:1 traceability to the 5 I/O-matrix scenarios [spec-1-2-access-role-un-derives-when-a-relationship-ends.md] — fixed: Execution now lists each test method against its matrix row, and Acceptance Criteria has one Given/When/Then per row.
- [x] [Review][Defer] Department-management revoke path only exercises the direct (hop-0) case, not a multi-level department-ancestor chain [services/access-control-service/tests/AccessControlService.Api.Tests/AccessRoleResolverCompositionTests.cs:239] — deferred, pre-existing (the multi-hop walk itself is already unit-tested against the fake repository in Domain.Tests; this is only an integration-test coverage gap)
- [x] [Review][Defer] No department-management grant-direction test exists (reports-to has both revoke and grant tests; department-management only has revoke) [services/access-control-service/tests/AccessControlService.Api.Tests/AccessRoleResolverCompositionTests.cs] — deferred, pre-existing test-coverage asymmetry, not required by the frozen I/O matrix
- [x] [Review][Defer] Project-line revoke test only covers Role: DeliveryManager, not ProjectManager [services/access-control-service/tests/AccessControlService.Api.Tests/AccessRoleResolverCompositionTests.cs:347] — deferred; role-specific differentiation isn't part of ProjectLine resolution yet (Story 1.9's project-line-narrowing scope)
- [x] [Review][Defer] sprint-status.yaml still shows `1-1-two-dimensional-access-role-resolution: review` even though its PR (#14) already merged to main [_bmad-output/implementation-artifacts/sprint-status.yaml] — deferred, pre-existing staleness not caused by this diff

## Design Notes

No caching layer exists anywhere in the current stack (`AccessRoleResolver` holds no state between calls beyond its constructor-injected dependencies; `EfRelationshipRepository` uses `.AsNoTracking()` throughout). This story's entire scope is proving that property with tests a reviewer can point to, not building a new mechanism. If any new test fails, diagnose the cause before touching anything: fix the test if its assumptions were wrong, fix the resolver/repository if the failure reveals a real regression — see the reconciled "Never" bullet above.

## Verification

**Commands:**
- `cd services/access-control-service && dotnet build --configuration Release` — expected: builds clean, matches CI
- `cd services/access-control-service && dotnet test --configuration Release` — expected: all tests pass, including the five new scenarios above and the full existing suite (unaffected)
