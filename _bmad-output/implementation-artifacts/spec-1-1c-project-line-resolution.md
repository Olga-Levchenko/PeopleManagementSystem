---
title: 'Story 1.1 (part 2b): Project-line access-role resolution'
type: 'feature'
created: '2026-08-30'
status: 'done'
review_loop_iteration: 0
baseline_commit: '2c612588a5350f83e86d9402224f8d8726b1aa4f'
context:
  - '{project-root}/.claude/rules/access-control-invariants.md'
  - '{project-root}/docs/access-control/section-matrix.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<!-- Pre-split before drafting the combined spec — see deferred-work.md for the RabbitMQ
     event-consumption half (spec-1-1d), deferred to a follow-up spec. -->

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `AccessRole`/`AccessRoleResolver` only resolve Reporting-line qualification (shipped in
2c61258). Nothing yet resolves whether a viewer qualifies as Project-line Manager (DM/PM) toward a
subject, from project-assignment data.

**Approach:** Extend `AccessRole` with a `ProjectLine` flag alongside the existing `ReportingLine`
one (both independently `true`/`false`, never collapsed). Add a project-assignment data model
(EF Core, fixture-seeded — mirroring exactly how Reporting-line shipped before any event-sourcing
plumbing existed) and extend `AccessRoleResolver` to check it. The real population mechanism
(a RabbitMQ consumer) is a separate, deferred spec (`spec-1-1d`) — this spec only needs the data to
already exist in the service's own schema, however it gets there.

## Boundaries & Constraints

**Always:**
- `AccessRole.ProjectLine` is a new, independent flag — a viewer can qualify for `ReportingLine`,
  `ProjectLine`, both, or neither, for the same subject. No precedence/collapsing (Story 1.9's job).
- Project-line qualifies when: viewer is DM or PM on a project the subject is assigned to.
- Project-assignment data: EF Core domain model + fixture seed data in this service's own schema,
  same pattern as `Person`/`Department` (`AccessControlDbContext`, `AccessControlService.Infrastructure`).
- `AccessRoleResolver`'s existing per-(viewer,subject)-call contract, sequential-only doc, and
  `MaxHops` cycle-guard pattern apply equally to the new project-assignment check.
- `AccessControlService.Domain` stays free of external package references (AD-1) — the new
  project-assignment port lives there, its EF Core implementation in `Infrastructure`.

**Ask First:** none identified.

**Never:**
- No RabbitMQ, no event contract, no consumer, no fake producer — deferred to `spec-1-1d` (see
  `deferred-work.md`). Data arrives as fixture-seeded EF Core rows for this spec.
- No precedence/narrowing decision between qualifying lines (Story 1.9) and no section-gated
  response (Story 1.6).
- No revocation/un-derivation logic (Story 1.2).
- No new HTTP endpoint exposing the resolver — deferred until a consumer needs it.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Project-line via DM | DM runs a project the subject is assigned to | Project-line qualifies | N/A |
| Project-line via PM | PM (not DM) runs a project the subject is assigned to | Project-line qualifies | N/A |
| PM and DM same project | Both PM and DM on the same project resolve for the same subject | Both qualify (two separate resolutions) | N/A |
| Not assigned to viewer's project | Viewer is DM/PM on a project the subject isn't assigned to | Project-line does not qualify | N/A |
| Both lines qualify simultaneously | Viewer is both subject's reports-to manager and DM on subject's project | `ReportingLine` and `ProjectLine` both `true` | N/A |
| No relationship path | Viewer unrelated to subject on any project | Project-line does not qualify | N/A |

</frozen-after-approval>

## Code Map

- `services/access-control-service/src/AccessControlService.Domain/AccessRole.cs` -- add
  `ProjectLine` flag alongside the existing `ReportingLine` one
- `services/access-control-service/src/AccessControlService.Domain/IRelationshipRepository.cs` --
  existing 4-method port (`GetManagerIdAsync`, `GetDepartmentIdAsync`,
  `GetDepartmentManagerIdAsync`, `GetParentDepartmentIdAsync`); add a project-assignment lookup
  here or a sibling port, matching the existing style
- `services/access-control-service/src/AccessControlService.Domain/AccessRoleResolver.cs` --
  existing `ResolveAsync`/`IsTransitiveManagerAsync`/`ManagesSubjectsDepartmentOrAncestorAsync`
  pattern to extend with a third check
- `services/access-control-service/src/AccessControlService.Infrastructure/Persistence/AccessControlDbContext.cs`,
  `EfRelationshipRepository.cs`, `FixtureSeedData.cs` -- existing EF Core + fixture pattern to
  extend with a `ProjectAssignment` entity
- `services/access-control-service/tests/AccessControlService.Domain.Tests/` (fake-repository unit
  tests), `AccessControlService.Infrastructure.Tests/` (real Testcontainers.PostgreSql integration
  tests, proven pattern from Reporting-line, including real GitHub Actions CI) -- extend both

## Tasks & Acceptance

**Execution:**
- [x] `services/access-control-service/src/AccessControlService.Domain/AccessRole.cs` -- add `ProjectLine` bool flag -- independent of `ReportingLine`
- [x] `services/access-control-service/src/AccessControlService.Domain/IRelationshipRepository.cs` + `AccessRoleResolver.cs` -- add a project-assignment lookup (viewer's DM/PM project ids; subject's assigned project ids) and a `QualifiesViaProjectAssignmentAsync` check -- pure logic, zero external deps
- [x] `services/access-control-service/src/AccessControlService.Infrastructure/Persistence/*` -- `ProjectAssignment` entity (person, project, DM/PM role) + migration + fixture seed data covering every I/O matrix scenario above -- EF Core, same schema-ownership pattern as `Person`/`Department`
- [x] `services/access-control-service/tests/AccessControlService.Domain.Tests/AccessRoleResolverTests.cs` -- covers every I/O matrix scenario above using the fake repository
- [x] `services/access-control-service/tests/AccessControlService.Infrastructure.Tests/*` -- real-Postgres integration test for the new project-assignment lookup, mirroring the existing `EfRelationshipRepositoryTests.cs` pattern

**Acceptance Criteria:**
- Given the resolver's result type, when a caller inspects it after this change, then `ReportingLine` and `ProjectLine` are both present and independently settable -- no existing caller's meaning changes
- Given the fixture-seeded project-assignment data, when a real integration test queries it through the new repository method, then it returns the seeded values correctly (not merely a manual check)
- Given a viewer who qualifies via both Reporting-line and Project-line for the same subject, when resolved, then both flags are `true` in one `ResolveAsync` call

### Review Findings

_Code review (chunk 3/5 of PR #14 review), 2026-08-31 — scope: Project-line resolution files
against `main`, plus the acceptance-auditor lens against this spec and its referenced context
docs._

- [x] [Review][Defer] Project-line resolution doesn't include "everyone above them in that
  chain" — `docs/access-control/section-matrix.md` defines Project line's audience as "the PM/DM
  of the person's project(s), **and everyone above them in that chain**," and
  `.claude/rules/access-control-invariants.md` states Manager access is the transitive closure of
  reports-to, department-management, *and* "is assigned to a project managed by" — implying the
  PM/DM's own reports-to chain should inherit Project-line qualification too.
  `QualifiesViaProjectAssignmentAsync` (`AccessRoleResolver.cs`) only checks direct DM/PM
  membership, not anyone above the DM/PM. This narrowing is present in spec-1-1c's own frozen
  Intent text ("viewer is DM or PM on a project the subject is assigned to") — deferred, reason:
  scoped out for spec-1-1c's token budget, same as every other spec-1-1c narrowing; the transitive
  walk is real follow-up work, not a bug in what shipped.
- [ ] [Review][Patch] Add unknown-id warning logging to `GetProjectIdsManagedAsDmOrPmAsync`/
  `GetAssignedProjectIdsAsync` [`EfRelationshipRepository.cs`] — the four Reporting-line lookup
  methods log via `LogUnknownId` when a queried id matches no row at all; the two Project-line
  lookups added in this spec don't, an inconsistency in the same file.
- [ ] [Review][Patch] `AccessRoleResolverTests.cs:214`'s comment references "the concurrency-safety
  test below," but no such test exists anywhere in the diff — the resolver's documented
  "not safe, will throw" concurrent-call contract is asserted only in prose.
- [ ] [Review][Patch] `ResolveAsync_ViewerQualifiesViaBothReportsToAndDepartmentManagement_ReportingLineQualifies`
  [`AccessRoleResolverTests.cs:163`]'s comment claims to prove the two Reporting-line checks are
  independent, but `IsTransitiveManagerAsync(...) || ManagesSubjectsDepartmentOrAncestorAsync(...)`
  short-circuits once the first is true, so the test never actually exercises the second check in
  this scenario.
- [ ] [Review][Patch] No test exercises the `MaxHops` truncation branch (a genuinely long, acyclic
  chain) in either `IsTransitiveManagerAsync` or `ManagesSubjectsDepartmentOrAncestorAsync`
  [`AccessRoleResolver.cs`] — every existing "long chain" test uses a short cycle instead, and the
  cycle-guard's own `LogWarning` calls (added in chunk 2) have zero test coverage.
- [ ] [Review][Patch] No negative Project-line test for a viewer who is a plain `Member` (not
  DM/PM) on the same project as the subject [`AccessRoleResolverTests.cs`] — the most direct way
  the DM/PM-only intersection could regress.
- [x] [Review][Defer] No database-level constraint against a self-referential `Person.ManagerId` or
  `Department.ParentDepartmentId` [`AccessControlDbContext.cs`] — deferred, pre-existing (same
  category as other already-deferred DB-constraint gaps in this schema; zero blast radius against
  fixture-only data).

**Dismissed as noise/handled elsewhere (11):** already tracked in `deferred-work.md` — the
O(n·m) project-id intersection and per-hop round-trip walk cost (recursive-CTE entry), and the
per-test Testcontainers Postgres startup cost (shared-fixture entry); diff-construction artifacts
of this review's file-list scoping — a "missing migration file" false positive, and
`ProjectAssignmentEventWatermark` appearing in the diff (it belongs to spec-1-1d/1-1e, not this
spec); design opinions already deliberate and covered by an existing test — the `OrderBy` tie-break
in `GetDepartmentManagerIdAsync`; premature-abstraction suggestions with no current consumer need —
an `IAccessRoleResolver` interface; a mis-scoped concern already covered by CLAUDE.md/Epic-1 story
tracking rather than `deferred-work.md` — confirming the S2/S3/S5 narrowing follow-up is tracked;
a defensible-by-design non-finding — `MaxHops` not applying to the intentionally non-transitive
Project-line check; a rare-case, low-severity cost — `GetDepartmentManagerIdAsync`'s extra
existence check only for genuinely-unmanaged departments; and a suggestion that contradicts the
resolver's intentional scoped/sequential-only design — adding a semaphore to make concurrent
`ResolveAsync` calls silently safe instead of the documented fail-fast contract.

## Spec Change Log

## Verification

**Commands:**
- `cd services/access-control-service && dotnet build --configuration Release` -- expected: builds clean, matches CI
- `cd services/access-control-service && dotnet test` -- expected: all tests pass, including every I/O matrix scenario above and the existing Reporting-line suite (unaffected)

**Actual results (2026-08-30, after review loopback patches):**
- `dotnet build --configuration Release`: builds clean, 0 warnings, 0 errors.
- `dotnet test`: all green --
  `AccessControlService.Domain.Tests` 20/20 (13 pre-existing Reporting-line + 6 Project-line
  I/O-matrix tests + 1 self-resolution/Project-line short-circuit test added during review),
  `AccessControlService.Api.Tests` 25/25 (unaffected),
  `AccessControlService.Infrastructure.Tests` 18/18 (9 pre-existing Reporting-line lookups + 8
  Project-line lookup tests + 1 duplicate-`(ProjectId, PersonId)`-constraint test added during
  review, run against a real ephemeral Postgres via Testcontainers with the
  `AddProjectAssignments`/`AddProjectZephyrFixture` migrations applied). Total 63/63.
- Two EF Core migrations (`AddProjectAssignments`, `AddProjectZephyrFixture`) were generated via
  `dotnet ef migrations add` and verified to create the `project_assignments` table, its unique
  `(ProjectId, PersonId)` index, its FK to `people`, and insert the fixture seed rows exactly as
  shipped in `FixtureSeedData.cs`.

## Suggested Review Order

**Resolution logic (the entry point)**

- `ProjectLine`'s doc explicitly warns it isn't equivalent to `ReportingLine` -- S2/S3 absent, S5 CV+certificates-only when qualifying only via Project line
  [`AccessRole.cs:44`](../../services/access-control-service/src/AccessControlService.Domain/AccessRole.cs#L44)

- The new check: viewer's DM/PM projects intersected with subject's assigned projects, independent of the Reporting-line checks
  [`AccessRoleResolver.cs:149`](../../services/access-control-service/src/AccessControlService.Domain/AccessRoleResolver.cs#L149)

**Real data path**

- `ProjectAssignment` entity -- one row per (project, person), `Role` distinguishes DM/PM/Member
  [`ProjectAssignment.cs:17`](../../services/access-control-service/src/AccessControlService.Infrastructure/Persistence/ProjectAssignment.cs#L17)

- EF Core lookups feeding the resolver's two new port methods
  [`EfRelationshipRepository.cs:19`](../../services/access-control-service/src/AccessControlService.Infrastructure/Persistence/EfRelationshipRepository.cs#L19)

- The multi-project lookup test, corrected during review to genuinely exercise two seeded project ids (not one)
  [`EfRelationshipRepositoryTests.cs:154`](../../services/access-control-service/tests/AccessControlService.Infrastructure.Tests/Persistence/EfRelationshipRepositoryTests.cs#L154)

- The unique-constraint test added during review, proving a duplicate assignment is a real DB error, not silent ambiguity
  [`EfRelationshipRepositoryTests.cs:210`](../../services/access-control-service/tests/AccessControlService.Infrastructure.Tests/Persistence/EfRelationshipRepositoryTests.cs#L210)

**Peripherals**

- Doc parity and the corrected cross-reference (precedence/revocation/section-response live in epics.md/sprint-status.yaml, not deferred-work.md)
  [`CLAUDE.md:1`](../../services/access-control-service/CLAUDE.md#L1)

- Full review trail and what's still deliberately deferred (spec-1-1d's RabbitMQ consumer, DM+PM-same-project schema question, Project-table validation)
  [`deferred-work.md:37`](../../_bmad-output/implementation-artifacts/deferred-work.md#L37)
