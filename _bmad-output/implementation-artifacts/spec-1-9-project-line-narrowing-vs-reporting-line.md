---
title: 'Story 1.9: Project line narrowing vs. Reporting line'
type: 'feature'
created: '2026-09-01'
status: 'done'
review_loop_iteration: 0
baseline_commit: '6d3900f821a7e95b75ee4caf511006392b585f16'
context:
  - '{project-root}/.claude/rules/access-control-invariants.md'
  - '{project-root}/docs/access-control/section-matrix.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nothing exposes `AccessRoleResolver` over HTTP yet, and nothing decides which profile
sections a Manager-access viewer actually gets — so Story 1.9's core rule (a Project-line-only
viewer loses S2/S3 and gets S5 restricted to CV+certificates, while a Reporting-line viewer, or
anyone who is *also* Reporting-line, gets full access) exists only as a doc-level claim, unproven
by any code.

**Approach:** Add the ADR-003-recommended `GET /api/v1/access-roles/resolve` endpoint, and a new,
pure `ManagerSectionAccessPolicy` domain component that maps a resolved `AccessRole` to a per-
section (S1–S16) access decision for the Manager audience — access-control-service's own job per
AD-2 ("section... policy decisions"), independent of any actual profile field data (Story 1.6's
separate, not-yet-built remaining scope). The endpoint calls the existing `AccessRoleResolver`,
then this new policy, and returns both in one response.

## Boundaries & Constraints

**Always:**
- `ManagerSectionAccessPolicy` is a pure function of `AccessRole` (no I/O, no new dependencies) —
  it must match `docs/access-control/section-matrix.md`'s Reporting-line column for all 16
  sections, except S2/S3 (none) and S5 (read, CV+certificates only) when `ProjectLine` is the only
  qualifying line.
- Most-permissive-path-wins: whenever `ReportingLine` is true, the result is always the unnarrowed
  (Reporting-line) access for every section, regardless of `ProjectLine` — this resolves
  `section-matrix.md`'s open question ("does the S7 most-permissive-wins rule generalize to
  S2/S3/S5") the same way Story 1.9's own AC already answers it; update that doc's "Open question"
  section to record the resolution.
- The endpoint returns `managerSectionAccess: null` when neither line qualifies (no Manager access
  at all) — it never guesses at Self/PP/Colleague access, which this resolver doesn't compute.
- New Domain code stays dependency-free (AD-1); new response DTOs (including enum-to-string
  mapping) live in the Api project only, following `HealthCheckResponseWriter`'s existing
  `EnumValue.ToString()` convention rather than adding a JSON attribute to Domain.

**Ask First:** None anticipated.

**Never:**
- No S7 PM-vs-DM distinction here (`ProjectLine` doesn't yet distinguish DM/PM) — S7 is always
  ReadWrite in this policy for any Manager access; that nuance is Story 1.7's job.
- No per-custom-field S16 breakdown — S16 is section-level ReadWrite only; per-field visibility is
  Story 1.10's job.
- No actual profile field data, and no new endpoint beyond the one above — assembling real S1–S16
  field values from real data is Story 1.6's remaining, not-yet-built scope.
- No batch/multi-subject variant (explicitly out of scope per ADR-003).
- No caching layer.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Reporting-line only | `AccessRole { ReportingLine: true, ProjectLine: false }` | All 16 sections unnarrowed (matches section-matrix Reporting-line column) | N/A |
| Project-line only | `AccessRole { ReportingLine: false, ProjectLine: true }` | S2/S3 = none, S5 = read+CV/certs-only, all other sections unnarrowed (incl. S6) | N/A |
| Both lines qualify | `AccessRole { ReportingLine: true, ProjectLine: true }` | Unnarrowed result (most-permissive-path-wins) — identical to Reporting-line-only | N/A |
| Neither line qualifies | `AccessRole.None` via the endpoint | `managerSectionAccess: null` in the HTTP response; `reportingLine`/`projectLine` both false | N/A |
| Missing/invalid query param | `GET /api/v1/access-roles/resolve?viewerPersonId=not-a-guid&subjectPersonId=...` | 400 with ASP.NET Core's default `ApiController` validation problem body | Built-in model binding |

</frozen-after-approval>

## Code Map

- `services/access-control-service/src/AccessControlService.Domain/AccessRole.cs` — read-only reference; its own doc comment already names this exact narrowing as future work
- `services/access-control-service/src/AccessControlService.Domain/AccessRoleResolver.cs` — read-only reference; `ResolveAsync` is the input this policy consumes
- `services/access-control-service/src/AccessControlService.Domain/ManagerSectionAccessPolicy.cs` — NEW: `ProfileSection` isn't needed as a type — use 16 named properties (see Design Notes); `SectionAccessLevel` enum (`None`/`Read`/`ReadWrite`), `SectionAccess` record, `ManagerSectionAccess` record, `ManagerSectionAccessPolicy.Resolve(AccessRole)`
- `services/access-control-service/src/AccessControlService.Api/Program.cs` — reference only: `AddControllers()`/`MapControllers()` already wired, no change needed; `AccessRoleResolver` already in DI
- `services/access-control-service/src/AccessControlService.Api/Controllers/AccessRolesController.cs` — NEW: `GET api/v1/access-roles/resolve?viewerPersonId={guid}&subjectPersonId={guid}`, maps Domain → response DTOs
- `services/access-control-service/tests/AccessControlService.Api.Tests/AccessRoleResolverCompositionTests.cs` — pattern to follow for a real WebApplicationFactory + Testcontainers Postgres HTTP test; reuse `FixtureSeedData` ids
- `docs/access-control/section-matrix.md` — update "Open question" section (resolve precedence) and the Test coverage column for S1–S16 (Reporting-line/Project-line columns only — Self/PP/Colleague/Shared-link remain untouched by this story)
- `services/access-control-service/CLAUDE.md` — add the new endpoint/policy to the service's own doc, per existing convention of documenting each story's shipped surface there

## Tasks & Acceptance

**Execution:**
- [x] `services/access-control-service/src/AccessControlService.Domain/ManagerSectionAccessPolicy.cs` — add the pure policy resolving all 16 sections from an `AccessRole` — proves the I/O matrix's first three rows
- [x] `services/access-control-service/tests/AccessControlService.Domain.Tests/ManagerSectionAccessPolicyTests.cs` — unit-test all 16 sections for both narrowed and unnarrowed cases, plus the combined-lines case
- [x] `services/access-control-service/src/AccessControlService.Api/Controllers/AccessRolesController.cs` — add the resolve endpoint calling `AccessRoleResolver` then `ManagerSectionAccessPolicy`
- [x] `services/access-control-service/tests/AccessControlService.Api.Tests/AccessRoleResolverCompositionTests.cs` — add real end-to-end HTTP tests (DI-composed, Testcontainers Postgres) for the endpoint, including the neither-line-qualifies and invalid-query-param rows
- [x] `docs/access-control/section-matrix.md` — resolve the open question, update Test coverage column
- [x] `services/access-control-service/CLAUDE.md` — document the new endpoint and policy

**Acceptance Criteria:**
- Given a viewer resolved as Manager solely via Project line, when they read the subject's profile, then S2 and S3 are absent and S5 is read-only limited to CV and certificates
- Given the same Project-line-only viewer, when any other section is considered, including S6, then it matches what a Reporting-line viewer would get
- Given a viewer who is simultaneously Reporting line and Project line for the same subject, when their access is resolved, then they get the Reporting line's unnarrowed access

## Design Notes

`ManagerSectionAccess` uses 16 explicit named properties (`S1`..`S16`), not a
`Dictionary<enum, ...>` — avoids ambiguity in enum-key JSON serialization and gives a
self-documenting, fixed-shape Swagger contract for a fixed 16-section matrix. `SectionAccessLevel`
stays a plain enum in Domain (no JSON attribute — keeps Domain dependency-free per AD-1); the Api
layer's response DTOs expose it as `Level.ToString()` (PascalCase strings, e.g. `"ReadWrite"`),
matching `HealthCheckResponseWriter`'s existing `report.Status.ToString()` convention exactly.

## Verification

**Commands:**
- `cd services/access-control-service && dotnet build --configuration Release` — expected: builds clean
- `cd services/access-control-service && dotnet test --configuration Release` — expected: all tests pass, including the new policy unit tests and endpoint integration tests

## Suggested Review Order

**Core policy: the narrowing decision**

- Entry point — the pure function every other stop builds on; fail-closed guard at the top.
  [`ManagerSectionAccessPolicy.cs:104`](../../services/access-control-service/src/AccessControlService.Domain/ManagerSectionAccessPolicy.cs#L104)
- Most-permissive-path-wins: `ReportingLine=true` always wins, even with `ProjectLine=true`.
  [`ManagerSectionAccessPolicy.cs:125`](../../services/access-control-service/src/AccessControlService.Domain/ManagerSectionAccessPolicy.cs#L125)
- Fail-closed guard, added after review found the original silently returned full access.
  [`ManagerSectionAccessPolicy.cs:114`](../../services/access-control-service/src/AccessControlService.Domain/ManagerSectionAccessPolicy.cs#L114)

**HTTP transport: exposing the resolver for the first time**

- The new endpoint — thin wrapper composing `AccessRoleResolver` then the policy above.
  [`AccessRolesController.cs:41`](../../services/access-control-service/src/AccessControlService.Api/Controllers/AccessRolesController.cs#L41)
- `managerSectionAccess` is `null` whenever neither line qualifies — never guesses Self/PP/Colleague.
  [`AccessRolesController.cs:48`](../../services/access-control-service/src/AccessControlService.Api/Controllers/AccessRolesController.cs#L48)

**Doc/architecture reconciliation**

- Resolves the section-matrix's former open question on multi-path precedence.
  [`section-matrix.md:109`](../../docs/access-control/section-matrix.md#L109)
- ADR-003 addendum recording the actual shipped response shape (adds `managerSectionAccess`).
  [`ADR-003-epic-1-remaining-story-dependencies.md:160`](../../docs/decisions/ADR-003-epic-1-remaining-story-dependencies.md#L160)
- Closes three stale deferred-work entries that were waiting on exactly this endpoint.
  [`deferred-work.md:278`](deferred-work.md#L278)

**Tests**

- Fail-closed guard's regression test.
  [`ManagerSectionAccessPolicyTests.cs:40`](../../services/access-control-service/tests/AccessControlService.Domain.Tests/ManagerSectionAccessPolicyTests.cs#L40)
- All 16 sections, Reporting-line-only and Project-line-only cases.
  [`ManagerSectionAccessPolicyTests.cs:68`](../../services/access-control-service/tests/AccessControlService.Domain.Tests/ManagerSectionAccessPolicyTests.cs#L68)
- Real DI-composed, Testcontainers-Postgres HTTP tests for the endpoint's narrowing behavior.
  [`AccessRoleResolverCompositionTests.cs:518`](../../services/access-control-service/tests/AccessControlService.Api.Tests/AccessRoleResolverCompositionTests.cs#L518)
- Missing-vs-invalid query param distinction, pinned after review flagged it as undertested.
  [`AccessRoleResolverCompositionTests.cs:650`](../../services/access-control-service/tests/AccessControlService.Api.Tests/AccessRoleResolverCompositionTests.cs#L650)
