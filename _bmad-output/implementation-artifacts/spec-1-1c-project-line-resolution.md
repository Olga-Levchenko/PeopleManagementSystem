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
