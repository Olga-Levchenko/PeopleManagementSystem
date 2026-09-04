---
title: 'Story 1.5: Full profile access as a separate, journaled grant'
type: 'feature'
created: '2026-09-04'
status: 'done'
review_loop_iteration: 0
baseline_commit: '1c4d9f84b6213e1e9d7399a6c21841c041c379c3'
context:
  - '{project-root}/.claude/rules/access-control-invariants.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The access-role resolver and section-gated profile response have no concept of Full profile access — no grant store, seeded holder, grant/revoke endpoints, or section-access mapping. This story's safeguards (no self-grant, no last-holder removal, every change journaled) cannot be retrofitted onto any existing relationship-derived mechanism.

**Approach:** Add `FullProfileAccessGrant` + `FullProfileAccessJournalEntry` tables to access-control-service; seed one bootstrap holder; expose `POST /api/v1/full-profile-access/{grant,revoke}` guarded by a stored-holder check; extend `AccessRoleResolver` with an `IFullProfileAccessRepository` call; add `FullProfileAccessLine` + all-RW section access to the resolve response; update the people-service adapter and profile assembly to consume the new fields.

## Boundaries & Constraints

**Always:**
- `FullProfileAccessLine` is derived from a stored grant row, not from relationships — `AccessRoleResolver` gets `IFullProfileAccessRepository` injected alongside the existing `IRelationshipRepository`.
- Every grant/revoke writes a `FullProfileAccessJournalEntry` in the same DB transaction as the grant row mutation.
- Caller guard on both endpoints: resolve `actorId` from the JWT `sub` claim (same pattern as `OrganisationalRelationshipsController`); reject 403 if the actor is not an active grant holder.
- Self-grant guard: if `actorId == subjectId`, reject 403.
- Last-holder guard on revoke: if active holder count is 1 and the target is that holder, reject 409.
- Bootstrap seed: one grant row in the initial migration using `FixtureSeedData.PlatformLeadId` as `holder_id` and `granted_by_actor_id` (self-seeded at deploy); add a startup check in `Program.cs` that throws if the grants table has zero rows.
- `FullProfileAccessSectionAccess` returns all sections S1–S16 as `ReadWrite` via a new `ManagerSectionAccessPolicy.ForFullProfileAccess()` method.

**Ask First:** None anticipated.

**Never:**
- Do not conflate with HR Admin's functional role — HR Admin has no standing profile-data access.
- Do not implement BFF proxy endpoints for grant/revoke in this story — defer; all ACs are verified against access-control-service directly.
- Do not skip the journal write — it must be atomic with the grant row change.
- Do not allow the people-service to short-circuit the resolver call because `FullProfileAccessLine=true`; the resolver runs in full and returns its complete result.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Startup — zero holders | `full_profile_access_grants` is empty at startup | Application fails fast with a descriptive error | Fatal; logged before crash |
| Non-holder attempts grant | `POST /grant`, actor not in grant table | 403 Forbidden | 403 |
| Self-grant | `POST /grant`, `subjectId == actorId` | 403 Forbidden | 403 |
| Valid grant | Existing holder grants another person | 201, grant row + journal entry created | N/A |
| Last-holder revoke | Only 1 active holder, `POST /revoke` for that holder | 409 Conflict | 409 |
| Valid revoke | 2+ holders, `POST /revoke` for one | 200, row removed + journal entry | N/A |
| Resolve — holder | `GET /resolve` with `viewerPersonId` = grant holder | `fullProfileAccessLine: true`, `fullProfileAccessSectionAccess` all 16 sections RW | N/A |
| Resolve — non-holder | `GET /resolve` with non-holder | `fullProfileAccessLine: false`, `fullProfileAccessSectionAccess: null` | N/A |
| Profile — holder | People-service `GET /profile/:id` with holder identity | All 16 sections present in response body | N/A |

</frozen-after-approval>

## Code Map

**access-control-service:**
- `src/AccessControlService.Domain/AccessRole.cs` — add `bool FullProfileAccessLine { get; init; }` property; comment at line 10 already reserves this extension point explicitly
- `src/AccessControlService.Domain/AccessRoleResolver.cs` — inject `IFullProfileAccessRepository`; set `FullProfileAccessLine = await _fullProfileAccessRepository.IsHolderAsync(viewerPersonId)` alongside existing `_repository` call
- `src/AccessControlService.Domain/ManagerSectionAccessPolicy.cs` — add `ForFullProfileAccess()` returning all 16 sections as `ReadWrite` (same return type as existing per-line methods)
- `src/AccessControlService.Infrastructure/Persistence/AccessControlDbContext.cs` — add `DbSet<FullProfileAccessGrant>` + `DbSet<FullProfileAccessJournalEntry>`; configure in `OnModelCreating`
- `src/AccessControlService.Infrastructure/Persistence/FullProfileAccessGrant.cs` — new entity: `Id` (Guid PK), `HolderId` (Guid, indexed), `GrantedByActorId` (Guid), `GrantedAtUtc` (DateTime UTC); table: `full_profile_access_grants`
- `src/AccessControlService.Infrastructure/Persistence/FullProfileAccessJournalEntry.cs` — new entity: `Id` (Guid PK), `ActorId`, `SubjectId`, `Action` (enum: Grant|Revoke), `OccurredAtUtc`; table: `full_profile_access_journal_entries`
- `src/AccessControlService.Infrastructure/Persistence/IFullProfileAccessRepository.cs` — new: `Task<bool> IsHolderAsync(Guid personId)`, `Task<int> GetActiveCountAsync()`, `Task GrantAsync(Guid actorId, Guid subjectId)`, `Task RevokeAsync(Guid actorId, Guid subjectId)` — `GrantAsync`/`RevokeAsync` write both grant row and journal entry transactionally
- `src/AccessControlService.Infrastructure/Persistence/EfFullProfileAccessRepository.cs` — new: EF Core implementation using `AccessControlDbContext`
- `src/AccessControlService.Infrastructure/Persistence/Migrations/` — new migration adding both tables; seed one row: `HolderId = FixtureSeedData.PlatformLeadId`, `GrantedByActorId = FixtureSeedData.PlatformLeadId`, `GrantedAtUtc = 2026-01-01 UTC`
- `src/AccessControlService.Api/Controllers/AccessRolesController.cs` — update `AccessRoleResolveResponse`: add `required bool FullProfileAccessLine` + `required ManagerSectionAccessResponse? FullProfileAccessSectionAccess`; populate from resolver result + `ManagerSectionAccessPolicy.ForFullProfileAccess()` when `FullProfileAccessLine=true`
- `src/AccessControlService.Api/Controllers/FullProfileAccessController.cs` — new controller; `POST /api/v1/full-profile-access/grant` body: `{ subjectId: Guid }`; `POST /api/v1/full-profile-access/revoke` body: `{ subjectId: Guid }`; both extract `actorId` from `User.FindFirstValue(ClaimTypes.NameIdentifier)` or equivalent (same as `OrganisationalRelationshipsController`)
- `src/AccessControlService.Api/Program.cs` — startup validation: resolve `IFullProfileAccessRepository`, await `GetActiveCountAsync()`, throw `InvalidOperationException` if 0 (fail-fast before the app accepts traffic)

**people-service:**
- `src/modules/profile/adapters/http-access-role-resolution.adapter.ts` — parse `fullProfileAccessLine: boolean` + `fullProfileAccessSectionAccess: SectionAccessGroup | null` from resolve response (same pattern as existing `managerSectionAccess` / `peoplePartnerSectionAccess` fields in `parseSectionAccessGroup`)
- `src/modules/profile/` (profile assembly service or equivalent) — when resolved access has `fullProfileAccessLine=true`, use `fullProfileAccessSectionAccess` as the effective section set, overriding all other access lines (most-permissive path wins; Full profile access is the maximum)

**Tests:**
- `tests/AccessControlService.Infrastructure.Tests/EfFullProfileAccessRepositoryTests.cs` — new: cover `IsHolderAsync` (true/false), `GrantAsync` (grant row + journal entry created), `RevokeAsync` (row removed + journal entry), `GetActiveCountAsync` (correct count after mutations); uses Testcontainers Postgres pattern from existing Infrastructure test suite
- `tests/AccessControlService.Api.Tests/FullProfileAccessTests.cs` — new: integration tests covering every I/O matrix row using `WebApplicationFactory<Program>` + Testcontainers Postgres (same collection as `AccessRoleResolverCompositionTests`)
- `tests/AccessControlService.Api.Tests/AccessRoleResolverCompositionTests.cs` — add: one test asserting `FullProfileAccessLine=true` on `GET /resolve` for a grant holder; one asserting `FullProfileAccessLine=false` for a non-holder

## Tasks & Acceptance

**Execution:**
- [x] `src/AccessControlService.Infrastructure/Persistence/FullProfileAccessGrant.cs` — create entity; `FullProfileAccessJournalEntry.cs` — create entity
- [x] `src/AccessControlService.Infrastructure/Persistence/AccessControlDbContext.cs` — add both `DbSet`s and model configuration
- [x] `src/AccessControlService.Infrastructure/Persistence/Migrations/` — generate migration adding both tables + seed row for `PlatformLeadId`
- [x] `src/AccessControlService.Infrastructure/Persistence/IFullProfileAccessRepository.cs` + `EfFullProfileAccessRepository.cs` — create interface and EF Core implementation
- [x] `src/AccessControlService.Domain/AccessRole.cs` — add `FullProfileAccessLine` property
- [x] `src/AccessControlService.Domain/AccessRoleResolver.cs` — inject `IFullProfileAccessRepository`; populate `FullProfileAccessLine`
- [x] `src/AccessControlService.Domain/ManagerSectionAccessPolicy.cs` — add `ForFullProfileAccess()` returning all sections RW
- [x] `src/AccessControlService.Api/Controllers/AccessRolesController.cs` — extend `AccessRoleResolveResponse` with new fields; populate them
- [x] `src/AccessControlService.Api/Controllers/FullProfileAccessController.cs` — create grant + revoke endpoints with all guards
- [x] `src/AccessControlService.Api/Program.cs` — add startup zero-holder validation
- [x] `src/modules/profile/adapters/http-access-role-resolution.adapter.ts` — parse new resolve response fields
- [x] `src/modules/profile/` (profile assembly) — apply full-profile-access sections when `fullProfileAccessLine=true`
- [x] `tests/AccessControlService.Infrastructure.Tests/EfFullProfileAccessRepositoryTests.cs` — create repository unit tests
- [x] `tests/AccessControlService.Api.Tests/FullProfileAccessTests.cs` — create endpoint integration tests (all I/O matrix rows)
- [x] `tests/AccessControlService.Api.Tests/AccessRoleResolverCompositionTests.cs` — add two resolver composition tests

### Review Findings

- [x] [Review][Patch] Grant endpoint: concurrent duplicate-grant TOCTOU bubbles as unhandled 500 — two concurrent `POST /grant` calls for the same subject can both pass `IsHolderAsync` before either commits; the second `SaveChangesAsync` then hits the unique index on `HolderId` and throws `DbUpdateException`, which propagates as an unhandled 500 instead of 409. Fix: catch `DbUpdateException` in `GrantAsync` (or in the controller) and return 409. [`FullProfileAccessController.cs:68-79`] [`EfFullProfileAccessRepository.cs:31-54`]
- [x] [Review][Defer] TOCTOU on last-holder revoke guard — deferred, pre-existing; tracked in O4-157 [`FullProfileAccessController.cs:117-123`]
- [x] [Review][Defer] Down() migration drops `full_profile_access_grants` before `full_profile_access_journal_entries` with no FK integrity; a rolled-back migration leaves orphaned journal rows — deferred, pre-existing; low risk (rollback-only scenario, no runtime impact) [`20260904144036_AddFullProfileAccess.cs:62-68`]

**Acceptance Criteria:**
- Given the platform starts up with zero rows in `full_profile_access_grants`, then the application fails to start with a logged error naming the missing bootstrap state
- Given a user who does not currently hold Full profile access, when they attempt to grant it to themselves or anyone else via `POST /api/v1/full-profile-access/grant`, then the request is rejected 403
- Given an existing Full-profile-access holder, when they grant it to another person, then the grant takes effect and a `FullProfileAccessJournalEntry` row is written in the same transaction
- Given the platform currently has exactly one Full-profile-access holder, when an attempt is made to revoke that holder's access, then the revocation is rejected 409
- Given a Full-profile-access holder, when `GET /api/v1/access-roles/resolve` is called with their `viewerPersonId`, then the response contains `fullProfileAccessLine: true` and `fullProfileAccessSectionAccess` with all 16 sections as `ReadWrite`
- Given a Full-profile-access holder viewing any profile via people-service, when they request any section, then they receive RW access on every section, identical to the section matrix's Full-profile-access row

## Design Notes

**Journal isolation:** The `FullProfileAccessJournalEntry` table lives in access-control-service's own database (per AD-4). The people-service `RelationshipJournalEntry` covers org-relationship changes (1.3's scope). These are two distinct physical tables forming the logical "narrow journal" the spec describes — unifying them into one table is a future concern and out of scope here.

**Startup validation placement:** The zero-holder check runs after DI is fully built but before the host begins serving requests — `IHostApplicationLifetime` or a `IHostedService` startup hook are both acceptable. Prefer the hosted-service pattern to avoid blocking `WebApplication.Build()`.

**`FullProfileAccessLine` priority in profile assembly:** When a viewer has `fullProfileAccessLine=true`, their `fullProfileAccessSectionAccess` (all-RW) takes precedence over any narrower access from other lines. The "most-permissive path wins" principle already governs S7 (Story 1.7) and Project-line vs Reporting-line (Story 1.9); Full profile access is the maximum possible access.

## Verification

**Commands:**
- `cd services/access-control-service && dotnet build --configuration Release` — expected: builds clean
- `cd services/access-control-service && dotnet test --configuration Release` — expected: all tests pass, including the new `EfFullProfileAccessRepositoryTests` and `FullProfileAccessTests` suites
- `cd services/people-service && npm test` — expected: adapter and profile-assembly tests pass with the new `fullProfileAccessLine` field parsed correctly

## Suggested Review Order

**Domain design — the contract and resolution**

- Port placed in Domain so `AccessRoleResolver` can depend on it without touching Infrastructure (AD-1).
  [`IFullProfileAccessRepository.cs:1`](../../services/access-control-service/src/AccessControlService.Domain/IFullProfileAccessRepository.cs#L1)

- New `FullProfileAccessLine` flag sits alongside `ReportingLine`/`ProjectLine`/`PeoplePartnerLine` — independent stored-grant flag, never derived.
  [`AccessRole.cs:78`](../../services/access-control-service/src/AccessControlService.Domain/AccessRole.cs#L78)

- Resolver injects repository, sets the flag independently of all relationship lookups.
  [`AccessRoleResolver.cs:72`](../../services/access-control-service/src/AccessControlService.Domain/AccessRoleResolver.cs#L72)

- `ForFullProfileAccess()` returns all 16 sections as `ReadWrite`; the entry point for section computation.
  [`ManagerSectionAccessPolicy.cs:194`](../../services/access-control-service/src/AccessControlService.Domain/ManagerSectionAccessPolicy.cs#L194)

**Schema and persistence**

- Grant entity — unique index on `HolderId` enforces one-grant-per-person at the DB level.
  [`FullProfileAccessGrant.cs:1`](../../services/access-control-service/src/AccessControlService.Infrastructure/Persistence/FullProfileAccessGrant.cs#L1)

- Journal entity — immutable append-only record per grant/revoke; enum stored as `int` (see deferred-work for string-conversion note).
  [`FullProfileAccessJournalEntry.cs:1`](../../services/access-control-service/src/AccessControlService.Infrastructure/Persistence/FullProfileAccessJournalEntry.cs#L1)

- EF Core model config: `HolderId` unique index + bootstrap `HasData` seed for `PlatformLeadId`.
  [`AccessControlDbContext.cs:154`](../../services/access-control-service/src/AccessControlService.Infrastructure/Persistence/AccessControlDbContext.cs#L154)

- Migration adds both tables and seeds the bootstrap holder; the only migration that writes non-zero rows via `HasData`.
  [`20260904144036_AddFullProfileAccess.cs:14`](../../services/access-control-service/src/AccessControlService.Infrastructure/Persistence/Migrations/20260904144036_AddFullProfileAccess.cs#L14)

- `GrantAsync` wraps grant-row insert and journal-entry insert in one transaction; `RevokeAsync` early-returns with rollback if no grant row exists.
  [`EfFullProfileAccessRepository.cs:31`](../../services/access-control-service/src/AccessControlService.Infrastructure/Persistence/EfFullProfileAccessRepository.cs#L31)

**HTTP endpoints and startup**

- `POST /grant`: self-grant guard → non-holder guard → duplicate guard → atomic write.
  [`FullProfileAccessController.cs:44`](../../services/access-control-service/src/AccessControlService.Api/Controllers/FullProfileAccessController.cs#L44)

- `POST /revoke`: non-holder actor → non-holder subject → last-holder guard → atomic removal.
  [`FullProfileAccessController.cs:90`](../../services/access-control-service/src/AccessControlService.Api/Controllers/FullProfileAccessController.cs#L90)

- Startup validation: `PostgresException` fails fast (schema missing); network errors tolerated so health check stays the signal.
  [`FullProfileAccessStartupValidation.cs:34`](../../services/access-control-service/src/AccessControlService.Api/FullProfileAccessStartupValidation.cs#L34)

- `FullProfileAccessLine` + `FullProfileAccessSectionAccess` added to the resolve response; section access null when line is false.
  [`AccessRolesController.cs:64`](../../services/access-control-service/src/AccessControlService.Api/Controllers/AccessRolesController.cs#L64)

- DI registration: repository scoped, startup-validation registered as hosted service (blocks traffic until check passes).
  [`Program.cs:50`](../../services/access-control-service/src/AccessControlService.Api/Program.cs#L50)

**people-service integration**

- `AccessRoleResolution` extended with new fields; `parseSectionAccessGroup` reused for `fullProfileAccessSectionAccess`.
  [`profile.ports.ts:22`](../../services/people-service/src/modules/profile/profile.ports.ts#L22)

- FPA line checked first in `resolveAudience`; its all-RW section set takes precedence over all relationship lines.
  [`profile.service.ts:305`](../../services/people-service/src/modules/profile/profile.service.ts#L305)

**Tests**

- Integration tests for all 9 I/O matrix rows; includes journal-entry assertions to prove atomicity.
  [`FullProfileAccessTests.cs:88`](../../services/access-control-service/tests/AccessControlService.Api.Tests/FullProfileAccessTests.cs#L88)

- Repository tests: `IsHolderAsync`, `GrantAsync`, `RevokeAsync`, `GetActiveCountAsync` against real migrated Postgres.
  [`EfFullProfileAccessRepositoryTests.cs:44`](../../services/access-control-service/tests/AccessControlService.Infrastructure.Tests/Persistence/EfFullProfileAccessRepositoryTests.cs#L44)

- Resolver composition: `FullProfileAccessLine=true` for holder; `FullProfileAccessLine=false` for non-holder; isolation test proving FPA flag is independent of all three relationship flags.
  [`AccessRoleResolverCompositionTests.cs:738`](../../services/access-control-service/tests/AccessControlService.Api.Tests/AccessRoleResolverCompositionTests.cs#L738)
