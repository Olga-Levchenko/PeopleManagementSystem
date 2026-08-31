---
title: 'Story 1.1 (part 2a): Reporting-line access-role resolution'
type: 'feature'
created: '2026-08-30'
status: 'done'
review_loop_iteration: 1
baseline_commit: 'f56b26aa3ba19f1ec3bf6ddf16e9cee18497c490'
context:
  - '{project-root}/.claude/rules/access-control-invariants.md'
  - '{project-root}/docs/access-control/section-matrix.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<!-- Split from the original combined Reporting-line + Project-line spec (~2,200 tokens) — see
     deferred-work.md for Project-line resolution (spec-1-1c), deferred to a follow-up spec. -->

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `access-control-service` has no domain logic yet (scaffold-only, PR #14) — nothing
resolves whether a viewer qualifies as Reporting-line Manager toward a subject, from real
relationships.

**Approach:** Add an `AccessRoleResolver` computing whether Reporting-line qualifies for a
(viewer, subject) pair, from two relations — transitive reports-to and transitive
department-management (including parent departments) — backed by an EF Core domain model with
fixture-seeded test data. Split into three projects (Domain/Infrastructure/Api) per the
architecture spine's hexagonal-internals invariant (AD-1) — this is the first domain logic in the
service. Project-line resolution (project-assignment, RabbitMQ) is a separate, deferred spec.

## Boundaries & Constraints

**Always:**
- Resolve per (viewer, subject) pair on every call — never cache a single "current user role."
- Reporting-line qualifies when: reports-to at any transitive depth, OR department-management of
  the subject's department or any parent department.
- Resolver output is a boolean/flag for Reporting-line qualification now, shaped so Project-line
  can be added as a second flag later without changing the existing signature's meaning (e.g. a
  result type with a `ReportingLine` property today, extended later — not replaced).
- Reports-to/department-management: EF Core (`Npgsql.EntityFrameworkCore.PostgreSQL`) domain model
  + fixture seed data in this service's own schema, reusing `AppConfig`'s connection string.
- No hardcoded role-name checks anywhere — resolution reads only from relationship data.
- `AccessControlService.Domain` has zero external package references (pure logic, hexagonal
  boundary honored per AD-1); `Infrastructure` holds EF Core; `Api` stays the composition root.

**Ask First:** none identified.

**Never:**
- No Project-line/project-assignment resolution, no RabbitMQ — deferred to `spec-1-1c` (see
  `deferred-work.md`).
- No precedence/narrowing decision (Story 1.9's job) and no section-gated response (Story 1.6).
- No revocation/un-derivation logic (Story 1.2) — this resolves current qualification only.
- No People Partner or Full-profile-access resolution (Stories 1.5 and the HR line).
- No new HTTP endpoint exposing the resolver — deferred until a consumer needs it.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Transitive reports-to | Viewer reports N-deep to subject's manager | Reporting-line qualifies | N/A |
| Dept-management, parent dept | Viewer manages subject's dept or a parent dept | Reporting-line qualifies | N/A |
| Dept-management, unrelated dept | Viewer manages a department subject isn't in (and no parent relation) | Reporting-line does not qualify | N/A |
| No relationship path | Viewer unrelated to subject | Reporting-line does not qualify | N/A |
| Cross-subject isolation | Same viewer resolves toward 2 subjects in one batch | Each result independently correct | N/A |

</frozen-after-approval>

## Code Map

- `services/access-control-service/src/AccessControlService.Api/Configuration/AppConfig.cs` --
  existing connection-string validation pattern; reuse for `DbContext` registration
- `services/access-control-service/src/AccessControlService.Api/Program.cs` -- composition root to
  extend with `DbContext` registration
- `docs/access-control/section-matrix.md:19-22` -- Reporting line audience definition
- `.claude/rules/access-control-invariants.md` -- "transitive closure of three relations" (only
  reports-to + department-management in scope here), never hardcode a role name
- `_bmad-output/planning-artifacts/architecture/architecture-PeopleManagementSystem-2026-08-25/ARCHITECTURE-SPINE.md`
  AD-1 (hexagonal internals)
- `services/access-control-service/tests/AccessControlService.Api.Tests/` -- existing test-folder
  shape (mirrors `src/` 1:1) to extend into new `Domain`/`Infrastructure` test projects

## Tasks & Acceptance

**Execution:**
- [x] `services/access-control-service/src/AccessControlService.Domain/*.csproj` + `AccessRole.cs` (result type with a `ReportingLine` flag, shaped for later extension) + `AccessRoleResolver.cs` -- pure resolution logic, zero external deps -- honors AD-1's hexagonal boundary
- [x] `services/access-control-service/src/AccessControlService.Infrastructure/*.csproj`, `Persistence/AccessControlDbContext.cs` + migrations + fixture seed (reports-to/department hierarchy test data) -- EF Core, Npgsql provider, reuses `AppConfig`'s connection string
- [x] `services/access-control-service/src/AccessControlService.Api/Program.cs` -- wire `DbContext` registration into the composition root
- [x] `services/access-control-service/tests/AccessControlService.Domain.Tests/AccessRoleResolverTests.cs` -- covers every I/O matrix scenario above, plus a self-resolution test (`viewerId == subjectId` returns `ReportingLine = false`, documented as correct since Self is a separate audience the caller must check before consulting this resolver) and a department-ancestor test 2+ levels up (grandparent), not just one parent level
- [x] `services/access-control-service/tests/AccessControlService.Infrastructure.Tests/*.csproj`, `Persistence/EfRelationshipRepositoryTests.cs` -- a real integration test (against a real/ephemeral Postgres, matching `RealServerBindingTests`' subprocess/real-instance pattern) applying the actual migration and asserting `EfRelationshipRepository`'s four lookup methods return the seeded `FixtureSeedData` values correctly -- this is the only thing that actually proves the "seed data is present and queryable" acceptance criterion, and the only thing that would catch a bug in the real EF Core query translation (a column swapped, a wrong table queried, a mapping error) that the fake-repository-only `AccessRoleResolverTests` cannot see
- [x] `services/access-control-service/src/AccessControlService.Domain/AccessRoleResolver.cs` -- fix the `ResolveAsync` XML doc, which currently claims it's safe to call repeatedly "in the same request/batch" — the resolver holds a scoped, non-thread-safe `DbContext`, so concurrent calls (e.g. `Task.WhenAll` across subjects) would throw; the doc must say sequential-only per resolver instance
- [x] `services/access-control-service/tests/AccessControlService.Domain.Tests/AccessRoleResolverTests.cs` (cycle-safety tests) -- replace the 5-second `WaitAsync` timeout guard with a direct assertion on a bounded visited-node/hop count, so a cycle-guard regression fails immediately instead of after a 5-second hang
- [x] `services/access-control-service/.config/dotnet-tools.json` -- add the missing trailing newline, matching the rest of the repo's JSON files
- [x] `services/access-control-service/src/AccessControlService.Api/AccessControlService.Api.csproj`, `src/AccessControlService.Infrastructure/AccessControlService.Infrastructure.csproj` -- add a one-line comment on the `Microsoft.EntityFrameworkCore.Design` reference in each explaining why both need it (EF tooling resolves the package from the target project for `--project`/`--startup-project` commands), so a future contributor doesn't "clean up" one and silently break `dotnet ef`
- [x] `services/access-control-service/CLAUDE.md` -- add a Gotchas bullet noting that an unknown person/department id (not yet present in this service's fixture-only schema) is currently indistinguishable from "genuinely has no manager/department" — both resolve to `false` — and that this is tracked as a deferred decision, not an oversight

**Acceptance Criteria:**
- Given the three projects (Domain/Infrastructure/Api), when built, then `Domain` has zero external package references
- Given the fixture-seeded reports-to/department hierarchy, when a real integration test applies the migration against a real/ephemeral Postgres, then `EfRelationshipRepository`'s lookups return the seeded values correctly -- not merely confirmed by a manual `psql` check
- Given the resolver's result type, when a caller inspects it, then it's shaped to add a Project-line flag later without breaking the existing Reporting-line meaning
- Given `viewerId == subjectId`, when `ResolveAsync` is called, then it returns `ReportingLine = false` (a person is not their own manager), documented as a deliberate, tested outcome rather than an unreviewed edge case
- Given a department ancestor 2+ levels up (not just a direct parent), when resolved, then Reporting-line correctly qualifies, proving the "any ancestor" claim at more than one level

## Spec Change Log

### 2026-08-30 — Review loopback (iteration 1)

**Triggering findings:** (1) `EfRelationshipRepository` — the only production implementation of
`IRelationshipRepository` — had zero automated test coverage; `AccessRoleResolverTests` only
exercises a hand-written fake, so the spec's own "seed data is present and queryable" acceptance
criterion was verified solely by a manual `psql` check, not by any test `dotnet test` runs. A bug
in the real EF Core query translation would ship green. (2) `ResolveAsync`'s XML doc claims
concurrent/batch safety the scoped `DbContext` doesn't actually have. (3) Self-resolution
(`viewerId == subjectId`) and multi-level department-ancestor resolution had no test coverage.
(4) Several small hygiene gaps: cycle-safety tests use a slow wall-clock timeout instead of a
direct assertion, a missing trailing newline, and an unexplained duplicate `EntityFrameworkCore.Design`
package reference.

**Amended:** Tasks & Acceptance (added a real `AccessControlService.Infrastructure.Tests` project
proving the EF Core repository against real Postgres, a self-resolution test, a multi-level
department-ancestor test, the XML doc fix, the cycle-safety test improvement, and the two hygiene
fixes) and Acceptance Criteria (replaced the manually-verified seed-data criterion with one an
automated test actually proves).

**Known-bad state avoided:** a regression in the real EF Core query translation (wrong column,
wrong table, a mapping error) shipping undetected because the only tested code path is a fake
repository that has no relationship to the real EF mapping; a caller trusting the doc's false
concurrency-safety claim and hitting a runtime exception in production.

**KEEP instructions:** preserve the existing Domain/Infrastructure/Api project split, the
`AccessRole`/`AccessRoleResolver`/`IRelationshipRepository` design, the EF Core schema and fixture
seed data (including the deliberate `Department.ManagerId` FK omission, already correctly
documented), and the deliberate choice not to auto-migrate at startup (preserves the existing
"boots fine with Postgres down" health-check test contract) — none of these need to change, only
the missing test coverage, the doc/design mismatch, and the small hygiene items above.

## Design Notes

Three-project split (`Domain`/`Infrastructure`/`Api`) is new structure for this service — `Api`
currently holds everything. `Domain` depends on nothing external (testable in isolation);
`Infrastructure` implements a repository interface `Domain` defines (relationship lookups) against
EF Core; `Api` composes both at startup. The follow-up Project-line spec (`spec-1-1c`) adds a
second `Infrastructure` concern (RabbitMQ) without needing to touch this split again.

## Verification

**Commands:**
- `cd services/access-control-service && dotnet build --configuration Release` -- expected: builds clean, matches CI
- `cd services/access-control-service && dotnet test` -- expected: all resolver tests pass, including every I/O matrix scenario above, the self-resolution/multi-level-ancestor cases, and the new `AccessControlService.Infrastructure.Tests` project proving the real EF Core repository against actual Postgres

## Suggested Review Order

**Resolution logic (the entry point)**

- `AccessRole.None`'s doc + the `ReportingLine` flag shape -- built to add a Project-line flag later without breaking this meaning
  [`AccessRole.cs:13`](../../services/access-control-service/src/AccessControlService.Domain/AccessRole.cs#L13)

- Core resolver: transitive reports-to walk, dept-management walk (incl. ancestors), self-short-circuit, bounded cycle guard
  [`AccessRoleResolver.cs:42`](../../services/access-control-service/src/AccessControlService.Domain/AccessRoleResolver.cs#L42)

- The port `Infrastructure` implements -- four relationship lookups, kept minimal on purpose
  [`IRelationshipRepository.cs:10`](../../services/access-control-service/src/AccessControlService.Domain/IRelationshipRepository.cs#L10)

**Real data path (what review found missing first pass)**

- EF Core translation of the four lookups -- the deterministic tie-break added after review found `FirstOrDefaultAsync` had no ordering
  [`EfRelationshipRepository.cs:41`](../../services/access-control-service/src/AccessControlService.Infrastructure/Persistence/EfRelationshipRepository.cs#L41)

- Unique constraint added alongside the tie-break, so a duplicate department-manager becomes a DB error, not silent nondeterminism
  [`AccessControlDbContext.cs:74`](../../services/access-control-service/src/AccessControlService.Infrastructure/Persistence/AccessControlDbContext.cs#L74)

- The integration test that closes the original review gap: real Testcontainers Postgres, real migration, real query assertions
  [`EfRelationshipRepositoryTests.cs:54`](../../services/access-control-service/tests/AccessControlService.Infrastructure.Tests/Persistence/EfRelationshipRepositoryTests.cs#L54)

**Composition root**

- DI wiring for `DbContext`/`IRelationshipRepository`/`AccessRoleResolver` -- no `Database.Migrate()` at startup, deliberately, to preserve the existing "boots with Postgres down" health-check contract
  [`Program.cs:39`](../../services/access-control-service/src/AccessControlService.Api/Program.cs#L39)

**Peripherals**

- Doc parity: Tech Stack/Project Structure updated for the new split, plus the unknown-record-ambiguity Gotcha
  [`CLAUDE.md:1`](../../services/access-control-service/CLAUDE.md#L1)

- Full review trail and what's still deliberately deferred (Project-line resolution, unknown-id handling, recursive-CTE optimization)
  [`deferred-work.md:37`](../../_bmad-output/implementation-artifacts/deferred-work.md#L37)
