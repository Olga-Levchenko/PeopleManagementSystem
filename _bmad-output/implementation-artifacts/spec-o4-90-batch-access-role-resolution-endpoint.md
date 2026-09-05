---
title: 'O4-90: Batch access-role-resolution endpoint (Story 2.1 prerequisite)'
type: 'feature'
created: '2026-09-03'
status: 'done'
review_loop_iteration: 0
baseline_commit: '1c4d9f84b6213e1e9d7399a6c21841c041c379c3'
context:
  - '{project-root}/.claude/rules/access-control-invariants.md'
  - '{project-root}/services/access-control-service/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `GET /api/v1/access-roles/resolve` resolves one (viewer, subject) pair. Story 2.1's All Employees list must resolve access roles for 500+ subjects within p95 ≤ 2 s (NFR-2/SM-4). Calling it N times sequentially would require N × per-hop round-trips — unacceptably slow at real org scale.

**Approach:** Add `POST /api/v1/access-roles/resolve-batch` that accepts one `viewerPersonId` plus a list of `subjectPersonIds`, pre-computes the viewer's transitive relationships via five interface calls (O(5–6) DB round-trips total, independent of N), evaluates each subject in memory, and returns the same per-subject shape the single-resolve endpoint already returns (ADR-004 Decision 1).

## Boundaries & Constraints

**Always:** Recursive CTEs must be depth-bounded at 100 hops (same guard as the existing single-resolver walk). Empty `subjectPersonIds` → 200 + `{ results: [] }`. Subjects absent from the DB silently resolve to `AccessRole.None` (fail-closed, same Gotcha as the single endpoint). Existing `ResolveAsync` and `GET /api/v1/access-roles/resolve` must be unchanged. `ResolveBatchAsync` is a new method on `AccessRoleResolver`; it must NOT call `ResolveAsync` in a loop. `access-control-service` stays the sole owner of access-role decisions (AD-2) — no role resolution logic in people-service or BFF. `ppLine` for each subject = `(subject.PeoplePartnerId == viewerPersonId) || (subject.PeoplePartnerId ∈ reporteeIds)` — the second condition covers the HR-line case (viewer is transitively above the subject's PP) and reuses Query 1's output at zero extra round-trips. `ManagerSectionAccessPolicy.Resolve()` is called per-subject in the controller, guarded by `accessRole.ReportingLine || accessRole.ProjectLine` (identical guard to the single-resolve endpoint; never call it for a subject with `AccessRole.None`). If `viewerPersonId` appears in `subjectPersonIds`, that subject resolves to `AccessRole.None` (fail-closed, no self-elevation). Duplicate entries in `subjectPersonIds` → `400 Bad Request`. `subjectPersonIds.Count > 500` → `400 Bad Request` (matches the NFR-2/SM-4 scale target as the stated upper bound).

**Ask First:** If `Database.SqlQuery<Guid>` (EF Core 8 raw SQL) cannot cleanly return scalar Guid columns against this Postgres/Npgsql version, switch to `NpgsqlCommand`/`ExecuteReaderAsync` — halt and confirm before choosing the fallback.

**Never:** Calling `ResolveAsync` in a loop for the batch path. Adding joins to `people-service` tables. Caching batch results beyond the HTTP request lifetime. Wiring Story 2.1's All Employees list query to this endpoint — that is Story 2.1's own work.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| BATCH_REPORTING_LINE | viewer transitively manages first 100 of 500 subjects via reports-to chain | results[0..99].reportingLine = true, managerSectionAccess non-null (unnarrowed); rest reportingLine = false | N/A |
| BATCH_DEPT_MANAGEMENT | viewer's ManagesDepartmentId is subject's DepartmentId ancestor | that subject reportingLine = true | N/A |
| BATCH_PROJECT_LINE_ONLY | viewer is DM on project X; subject assigned to project X; no reporting-line | subject.projectLine = true, managerSectionAccess = narrowed (S2/S3 None, S5 CV+certs only) | N/A |
| BATCH_PP_LINE | viewer is subject's PeoplePartnerId | subject.peoplePartnerLine = true, peoplePartnerSectionAccess non-null | N/A |
| EMPTY_SUBJECTS | subjectPersonIds = [] | 200 { results: [] } | N/A |
| VIEWER_NOT_IN_DB | viewerPersonId matches no People row | all subjects: reportingLine/projectLine/ppLine = false, both sectionAccess = null | N/A |
| SUBJECT_NOT_IN_DB | one subjectPersonId missing from People | that entry: all flags false, both sectionAccess = null | N/A |
| VIEWER_IN_SUBJECTS | viewerPersonId ∈ subjectPersonIds | that entry: all flags false, both sectionAccess = null | N/A |
| DUPLICATE_SUBJECTS | subjectPersonIds contains duplicate Guids | 400 Bad Request | N/A |
| BATCH_SIZE_EXCEEDED | subjectPersonIds.Count > 500 | 400 Bad Request | N/A |

</frozen-after-approval>

## Code Map

- `src/AccessControlService.Domain/IRelationshipRepository.cs:13` — add 4 batch query methods + `SubjectBatchAttributes(Guid? DepartmentId, Guid? PeoplePartnerId)` record in this file
- `src/AccessControlService.Domain/AccessRoleResolver.cs` — add `ResolveBatchAsync(Guid viewerPersonId, IReadOnlyCollection<Guid> subjectPersonIds, CancellationToken ct) → Task<IReadOnlyDictionary<Guid, AccessRole>>`; calls the 4 new repo methods, evaluates subjects in memory; sequential-per-instance constraint from `ResolveAsync` XML doc does not apply here
- `src/AccessControlService.Infrastructure/Persistence/EfRelationshipRepository.cs` — implement the 4 new interface methods (see Design Notes for CTE patterns)
- `src/AccessControlService.Api/Controllers/AccessRolesController.cs:1` — add `[HttpPost("resolve-batch")]` action; add `AccessRoleBatchResolveRequest`, `AccessRoleBatchResolveResponse`, `AccessRoleBatchResultItem` records in same file; reuse existing `ToResponse(ManagerSectionAccess)` private method
- `tests/AccessControlService.Domain.Tests/` — extend `FakeRelationshipRepository` with the 4 new methods; add `AccessRoleResolverBatchTests` covering the I/O matrix above (including VIEWER_IN_SUBJECTS resolves to None, BATCH_PP_LINE_HR where ppLine is true via HR-line set membership)
- `tests/AccessControlService.Infrastructure.Tests/Persistence/EfRelationshipRepositoryTests.cs` — add cases for the 4 new batch methods against real Postgres (existing Testcontainers setup)
- `tests/AccessControlService.Api.Tests/AccessRoleResolverCompositionTests.cs` — add batch endpoint composition tests covering BATCH_REPORTING_LINE, BATCH_PROJECT_LINE_ONLY (narrowed section access), BATCH_PP_LINE, BATCH_PP_LINE_HR (HR-line ppLine via set membership), EMPTY_SUBJECTS, VIEWER_NOT_IN_DB, VIEWER_IN_SUBJECTS, DUPLICATE_SUBJECTS (400), BATCH_SIZE_EXCEEDED (400)

## Tasks & Acceptance

**Execution:**
- [x] `src/AccessControlService.Domain/IRelationshipRepository.cs` — add `SubjectBatchAttributes` record + 4 new batch interface methods with XML doc — Domain port extension
- [x] `src/AccessControlService.Domain/AccessRoleResolver.cs` — add `ResolveBatchAsync`: call the 4 new repo methods sequentially, compute `AccessRole` per subject from in-memory sets — core batch logic
- [x] `src/AccessControlService.Infrastructure/Persistence/EfRelationshipRepository.cs` — implement 4 new methods: `GetTransitiveReporteeIdsAsync` (Postgres recursive CTE on `people.manager_id`, depth ≤ 100), `GetManagedDepartmentSubtreeIdsAsync` (recursive CTE on `departments.parent_department_id` from viewer's `ManagesDepartmentId`, empty set if null), `GetSubjectAttributesBatchAsync` (LINQ `Contains` → `ToDictionaryAsync`), `GetSubjectsOnViewerProjectsAsync` (LINQ join on managed project ids) — O(4) queries total
- [x] `src/AccessControlService.Api/Controllers/AccessRolesController.cs` — add `POST /api/v1/access-roles/resolve-batch` action + 3 new DTO records — transport layer
- [x] `tests/AccessControlService.Domain.Tests/` — `FakeRelationshipRepository` + `AccessRoleResolverBatchTests` covering I/O matrix including VIEWER_IN_SUBJECTS and BATCH_PP_LINE_HR — unit coverage for batch logic
- [x] `tests/AccessControlService.Infrastructure.Tests/` — batch repository method tests against real Postgres — EF Core query translation proof
- [x] `tests/AccessControlService.Api.Tests/AccessRoleResolverCompositionTests.cs` — batch endpoint composition tests covering BATCH_REPORTING_LINE, BATCH_PROJECT_LINE_ONLY (narrowed section access), BATCH_PP_LINE, BATCH_PP_LINE_HR, EMPTY_SUBJECTS, VIEWER_NOT_IN_DB, VIEWER_IN_SUBJECTS, DUPLICATE_SUBJECTS (400), BATCH_SIZE_EXCEEDED (400) — end-to-end proof

**Acceptance Criteria:**
- Given a viewerPersonId who transitively manages 100 of 500 requested subjects, when `POST /api/v1/access-roles/resolve-batch` is called, then the 100 managed subjects return `reportingLine: true` and `managerSectionAccess` non-null; the remaining 400 return `reportingLine: false`
- Given a viewer who is DM on project X and a subject assigned to project X (no reporting-line), when the batch endpoint is called, then that subject returns `projectLine: true` and `managerSectionAccess.s2.level: "None"` (Project-line narrowing applied)
- Given an empty `subjectPersonIds` array, when the batch endpoint is called, then the response is `200 { results: [] }`
- Given a `viewerPersonId` that matches no person in the DB, when the batch endpoint is called, then every subject in the result has `reportingLine: false`, `projectLine: false`, `peoplePartnerLine: false`, `managerSectionAccess: null`, `peoplePartnerSectionAccess: null`
- Given `ResolveAsync` exists and is unchanged, when the single-resolve endpoint is called after this story ships, then it behaves identically to before
- Given a viewer who is transitively above subject B's People Partner in the HR hierarchy (but is not subject B's direct PP), when the batch endpoint is called, then subject B returns `peoplePartnerLine: true` and `peoplePartnerSectionAccess` non-null
- Given `viewerPersonId` appears in `subjectPersonIds`, when the batch endpoint is called, then that entry returns `reportingLine: false`, `projectLine: false`, `peoplePartnerLine: false`, `managerSectionAccess: null`, `peoplePartnerSectionAccess: null`
- Given `subjectPersonIds` contains duplicate Guid values, when the batch endpoint is called, then the response is `400 Bad Request`
- Given `subjectPersonIds.Count > 500`, when the batch endpoint is called, then the response is `400 Bad Request`

## Design Notes

**5 interface calls (6 round-trips in the general case: the department-subtree method makes an extra SingleOrDefaultAsync to check ManagesDepartmentId before firing the CTE, and project-line uses two sequential calls — GetProjectIdsManagedAsDmOrPmAsync then GetSubjectsOnViewerProjectsAsync). The critical property is O(constant) relative to the number of subjects N.** `GetTransitiveReporteeIdsAsync` uses a Postgres recursive CTE on `people.manager_id`, depth-bounded (not CYCLE clause — compatible with Postgres 13+):
```sql
WITH RECURSIVE reportees(id, depth) AS (
    SELECT id, 0 FROM people WHERE manager_id = @viewerPersonId
    UNION ALL
    SELECT p.id, r.depth + 1 FROM people p
    JOIN reportees r ON p.manager_id = r.id WHERE r.depth < 100
)
SELECT DISTINCT id AS "Value" FROM reportees
```
`Database.SqlQuery<Guid>(FormattableString)` (EF Core 8) requires the column aliased as `"Value"` for scalar return. `GetManagedDepartmentSubtreeIdsAsync` mirrors this on `departments.parent_department_id` starting from `(SELECT manages_department_id FROM people WHERE id = @viewerPersonId)`; returns empty set immediately if the viewer manages no department. `GetSubjectAttributesBatchAsync` and `GetSubjectsOnViewerProjectsAsync` use plain LINQ `Contains`-based queries (EF Core translates `Contains` to `= ANY(@ids)` in Npgsql).

**`SubjectBatchAttributes` in Domain:** it is part of the port contract (`IRelationshipRepository` returns it), so it lives in `AccessControlService.Domain` alongside the interface — not in Infrastructure.

**HR-line PP resolution:** `ppLine` is true when `subject.PeoplePartnerId == viewerPersonId` (direct assignment) OR `subject.PeoplePartnerId ∈ reporteeIds` (viewer is transitively above the subject's PP in the HR hierarchy). The second condition is the HR-line case — identical to the logic `IsTransitiveManagerAsync(viewerId, peoplePartnerId)` performs in the single-resolve path, but resolved for free by checking set membership in the already-computed `reporteeIds` from Query 1. No fifth query is required.

**Response shape reuses existing DTOs:** `AccessRoleBatchResultItem` embeds `AccessRoleResolveResponse`-equivalent fields (not a reference — copy the same shape) to avoid coupling the batch DTO to the single-resolve DTO type.

## Verification

**Commands:**
- `cd services/access-control-service && dotnet build --configuration Release` — expected: zero errors
- `cd services/access-control-service && dotnet test --configuration Release --filter "FullyQualifiedName~Batch"` — expected: all batch-specific tests pass (Docker required for Infrastructure tests)
- `cd services/access-control-service && dotnet test --configuration Release` — expected: full suite green, no regressions in existing `ResolveAsync`/`GET resolve` tests

## Suggested Review Order

**Domain contract — the port boundary**

- `SubjectBatchAttributes` record — per-subject read model passed across the hexagonal port
  [`IRelationshipRepository.cs:15`](../../services/access-control-service/src/AccessControlService.Domain/IRelationshipRepository.cs#L15)

- 4 new batch interface methods — defines the O(5-6) interface contract, independent of N
  [`IRelationshipRepository.cs:87`](../../services/access-control-service/src/AccessControlService.Domain/IRelationshipRepository.cs#L87)

**Core batch logic — the resolver**

- `ResolveBatchAsync` entry — pre-computes all viewer relationship sets in 5 interface calls, then evaluates in memory
  [`AccessRoleResolver.cs:107`](../../services/access-control-service/src/AccessControlService.Domain/AccessRoleResolver.cs#L107)

- Self-elevation guard — viewerPersonId in subjectPersonIds resolves fail-closed before any DB lookup
  [`AccessRoleResolver.cs:144`](../../services/access-control-service/src/AccessControlService.Domain/AccessRoleResolver.cs#L144)

- HR-line ppLine — `ppId ∈ reporteeIds` reuses Query 1 at zero extra round-trips
  [`AccessRoleResolver.cs:171`](../../services/access-control-service/src/AccessControlService.Domain/AccessRoleResolver.cs#L171)

**Postgres queries — the infrastructure**

- Recursive CTE for transitive reportees — depth-bounded at 100, quoted PascalCase column names for EF Core 8
  [`EfRelationshipRepository.cs:192`](../../services/access-control-service/src/AccessControlService.Infrastructure/Persistence/EfRelationshipRepository.cs#L192)

- Recursive CTE for department subtree — seeds from viewer's ManagesDepartmentId; early-returns empty set if null
  [`EfRelationshipRepository.cs:215`](../../services/access-control-service/src/AccessControlService.Infrastructure/Persistence/EfRelationshipRepository.cs#L215)

- Subject attributes batch — LINQ `Contains` translates to `= ANY(@ids)` in Npgsql; one round-trip for all subjects
  [`EfRelationshipRepository.cs:255`](../../services/access-control-service/src/AccessControlService.Infrastructure/Persistence/EfRelationshipRepository.cs#L255)

- Project-line subject filter — LINQ join on viewer's managed project id set
  [`EfRelationshipRepository.cs:280`](../../services/access-control-service/src/AccessControlService.Infrastructure/Persistence/EfRelationshipRepository.cs#L280)

**Transport and validation — the controller**

- `ResolveBatch` action — null guard, duplicate check, size guard (500 limit), then resolver dispatch
  [`AccessRolesController.cs:83`](../../services/access-control-service/src/AccessControlService.Api/Controllers/AccessRolesController.cs#L83)

- Batch DTOs — response shape copies single-resolve fields without referencing its type; avoids DTO coupling
  [`AccessRolesController.cs:228`](../../services/access-control-service/src/AccessControlService.Api/Controllers/AccessRolesController.cs#L228)

**Tests**

- 16 unit tests — all I/O matrix rows covered; FakeRelationshipRepository BFS stands in for real CTEs
  [`AccessRoleResolverBatchTests.cs:12`](../../services/access-control-service/tests/AccessControlService.Domain.Tests/AccessRoleResolverBatchTests.cs#L12)

- HR-line ppLine unit test — subject's PP is in viewer's transitive reportee set (2-hop chain)
  [`AccessRoleResolverBatchTests.cs:148`](../../services/access-control-service/tests/AccessControlService.Domain.Tests/AccessRoleResolverBatchTests.cs#L148)

- No-loop proof — asserts `ManagerLookupCount == 0`; `ResolveAsync`'s hop-by-hop path never fires
  [`AccessRoleResolverBatchTests.cs:331`](../../services/access-control-service/tests/AccessControlService.Domain.Tests/AccessRoleResolverBatchTests.cs#L331)

- CTE correctness against real Postgres — proves column-name quoting and depth semantics on live DB
  [`EfRelationshipRepositoryTests.cs:381`](../../services/access-control-service/tests/AccessControlService.Infrastructure.Tests/Persistence/EfRelationshipRepositoryTests.cs#L381)

- 11 batch composition tests — end-to-end through DI stack; department-management path covered at HTTP level
  [`AccessRoleResolverCompositionTests.cs:780`](../../services/access-control-service/tests/AccessControlService.Api.Tests/AccessRoleResolverCompositionTests.cs#L780)
