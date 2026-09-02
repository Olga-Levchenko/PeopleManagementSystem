---
title: 'Story 1.6b: PP ("People Partner"/HR line) access-role resolution'
type: 'feature'
created: '2026-09-02'
status: 'in-progress'
review_loop_iteration: 0
baseline_commit: '4980fd94c4c7088a69d04471a33cd275f5444d79'
context:
  - '{project-root}/.claude/rules/access-control-invariants.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `AccessRoleResolver` only resolves Reporting-line and Project-line; PP was flagged as a genuinely unowned gap during Story 1.6's first slice (no story ever scoped it), so `people-service`'s profile endpoint currently mislabels every real PP as a plain Colleague.

**Approach:** Add `PeoplePartnerLine` to `AccessRole`, resolved as: viewer == subject's assigned PP, OR viewer is transitively above that PP in the PP's own reports-to chain (the "HR line" — the PP's manager chain, never the subject's). Generalize the existing transitive reports-to walk (already used for Reporting-line) to start from any person id, and reuse it here. Extend the resolve endpoint's response and wire `people-service`'s `ProfileService` to treat it as a third qualifying line.

## Boundaries & Constraints

**Always:**
- PP's per-section access is cell-for-cell identical to the *unnarrowed* Reporting-line view (`docs/access-control/section-matrix.md` — PP is never narrowed, unlike Project line). Compute `peoplePartnerSectionAccess` by calling the existing `ManagerSectionAccessPolicy.Resolve` with `new AccessRole { ReportingLine = true }` — do not write a second, duplicate section mapping that could drift from the matrix.
- The HR-line walk reuses the exact same transitive-manager algorithm already proven for Reporting-line (same cycle guard, same `MaxHops`, same "truncated" warning) — generalize the existing private method's starting-point parameter, don't write a second copy.
- `PeoplePartnerLine` is independent of `ReportingLine`/`ProjectLine` — resolve it unconditionally, don't short-circuit on the other two.

**Ask First:** None anticipated.

**Never:**
- No change to `ReportingLine`/`ProjectLine`'s own resolution logic or existing response fields — purely additive.
- No Full-profile-access work (Story 1.5, still backlog — untouched).
- No batch/multi-subject variant (out of scope, same as the original endpoint).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Viewer is the assigned PP | `subject.peoplePartnerId == viewer.id` | `peoplePartnerLine: true`, `peoplePartnerSectionAccess` = unnarrowed full RW map | N/A |
| Viewer is above the PP (HR line) | viewer is the PP's manager (or manager's manager) | `peoplePartnerLine: true` | N/A |
| Viewer is subject's own manager, unrelated to PP's chain | Reporting-line viewer, isolated from PP's own manager chain | `reportingLine: true`, `peoplePartnerLine: false` — the two lines don't leak into each other | N/A |
| Subject has no assigned PP | `subject.peoplePartnerId == null` | `peoplePartnerLine: false` | N/A |
| Viewer equals subject | Self | `peoplePartnerLine: false` (handled by the existing early-return, unchanged) | N/A |

</frozen-after-approval>

## Code Map

- `services/access-control-service/src/AccessControlService.Domain/AccessRole.cs` — add `public bool PeoplePartnerLine { get; init; }`, update the class doc comment (it already anticipates this: "Any later line (People Partner...) can be added as a further additional property").
- `services/access-control-service/src/AccessControlService.Domain/IRelationshipRepository.cs` — add `Task<Guid?> GetPeoplePartnerIdAsync(Guid personId, CancellationToken cancellationToken = default)`, doc comment mirroring `GetManagerIdAsync`'s.
- `services/access-control-service/src/AccessControlService.Domain/AccessRoleResolver.cs:79-126` — rename `IsTransitiveManagerAsync(viewerId, subjectId, ct)`'s second parameter to `startId` (generalizes "whose reports-to chain to walk" — callers pass either `subjectId` for Reporting-line or the PP's id for PP-line); add a `PeoplePartnerLine` computation in `ResolveAsync` (lines 60-71): `var peoplePartnerId = await _repository.GetPeoplePartnerIdAsync(subjectId, ct); var peoplePartnerLine = peoplePartnerId is not null && (peoplePartnerId == viewerId || await IsTransitiveManagerAsync(viewerId, peoplePartnerId.Value, ct));`
- `services/access-control-service/src/AccessControlService.Infrastructure/Persistence/Person.cs:10-29` — add `public Guid? PeoplePartnerId { get; set; }` alongside `ManagerId`.
- `services/access-control-service/src/AccessControlService.Infrastructure/Persistence/EfRelationshipRepository.cs` — implement `GetPeoplePartnerIdAsync`, mirroring the existing `GetManagerIdAsync` implementation exactly (same `.AsNoTracking()` pattern).
- `services/access-control-service/src/AccessControlService.Infrastructure/Persistence/FixtureSeedData.cs:52-160` — add two new fixture people isolated from the existing reports-to chain: `HrDirectorId` (no manager) and `HrPartnerId` (`ManagerId = HrDirectorId`); set `EngineerId`'s existing `Person` record's new `PeoplePartnerId = HrPartnerId`. Deliberately isolated from `DirectorId`/`PlatformLeadId`'s chain so PP-line and Reporting-line tests don't accidentally aid each other.
- New EF Core migration (`dotnet ef migrations add AddPeoplePartnerToPerson ...`, see this service's CLAUDE.md Commands) — adds the `PeoplePartnerId` column + re-seeds `FixtureSeedData`'s updated `HasData`.
- `services/access-control-service/src/AccessControlService.Api/Controllers/AccessRolesController.cs:41-58,91-103` — add `PeoplePartnerLine`/`PeoplePartnerSectionAccess` to `Resolve` and `AccessRoleResolveResponse`, computed as `accessRole.PeoplePartnerLine ? ToResponse(ManagerSectionAccessPolicy.Resolve(new AccessRole { ReportingLine = true })) : null`.
- `services/access-control-service/tests/AccessControlService.Domain.Tests/` — new `AccessRoleResolverTests` cases per the I/O matrix, fake `IRelationshipRepository`.
- `services/access-control-service/tests/AccessControlService.Infrastructure.Tests/` — new `EfRelationshipRepositoryTests` case for `GetPeoplePartnerIdAsync` against real seeded Postgres.
- `services/access-control-service/tests/AccessControlService.Api.Tests/AccessRoleResolverCompositionTests.cs` — new HTTP-level PP-line scenarios (direct PP, HR-line transitive, isolation from Reporting-line).
- `services/people-service/src/modules/profile/profile.ports.ts:17-24` — extend `AccessRoleResolution` with `peoplePartnerLine: boolean; peoplePartnerSectionAccess: { s1: SectionAccess; s2: SectionAccess } | null;`; extend `NEITHER_LINE_RESOLUTION` accordingly.
- `services/people-service/src/modules/profile/profile.service.ts:125-149` — `resolveAudience` checks `peoplePartnerLine` alongside `reportingLine`/`projectLine`: if PP line qualifies (with a non-null `peoplePartnerSectionAccess`), use its `s1`/`s2` levels; the existing Manager check stays as-is and takes priority when both qualify (matrix cells are identical either way, so order has no visible effect, but Manager stays first since it was already there).
- `services/people-service/src/modules/profile/__tests__/profile.service.spec.ts` — new PP-line case.
- `services/people-service/test/profile.e2e-spec.ts` — new PP-line e2e case (fake resolver returns `peoplePartnerLine: true`).
- `docs/access-control/section-matrix.md:69-77` — update the "Test coverage note" to record PP-line resolver coverage.

## Tasks & Acceptance

**Execution:**
- [ ] `services/access-control-service/src/AccessControlService.Domain/AccessRole.cs` -- add `PeoplePartnerLine` -- new flag
- [ ] `services/access-control-service/src/AccessControlService.Domain/IRelationshipRepository.cs` -- add `GetPeoplePartnerIdAsync` -- new port method
- [ ] `services/access-control-service/src/AccessControlService.Domain/AccessRoleResolver.cs` -- generalize the transitive walk + PP-line resolution -- core logic
- [ ] `services/access-control-service/src/AccessControlService.Infrastructure/Persistence/Person.cs` -- add `PeoplePartnerId` -- backing data
- [ ] `services/access-control-service/src/AccessControlService.Infrastructure/Persistence/EfRelationshipRepository.cs` -- implement the new port method
- [ ] `services/access-control-service/src/AccessControlService.Infrastructure/Persistence/FixtureSeedData.cs` -- add isolated HR-chain fixture people
- [ ] EF Core migration -- `dotnet ef migrations add AddPeoplePartnerToPerson` -- schema + reseed
- [ ] `services/access-control-service/src/AccessControlService.Api/Controllers/AccessRolesController.cs` -- extend response
- [ ] `services/access-control-service/tests/AccessControlService.Domain.Tests/` -- I/O matrix cases, fake repository
- [ ] `services/access-control-service/tests/AccessControlService.Infrastructure.Tests/` -- real-Postgres `GetPeoplePartnerIdAsync` case
- [ ] `services/access-control-service/tests/AccessControlService.Api.Tests/AccessRoleResolverCompositionTests.cs` -- HTTP-level PP-line scenarios
- [ ] `services/people-service/src/modules/profile/profile.ports.ts` -- extend the TS contract
- [ ] `services/people-service/src/modules/profile/profile.service.ts` -- treat PP line as a third qualifying line
- [ ] `services/people-service/src/modules/profile/__tests__/profile.service.spec.ts` -- new PP-line unit case
- [ ] `services/people-service/test/profile.e2e-spec.ts` -- new PP-line e2e case
- [ ] `docs/access-control/section-matrix.md` -- update Test coverage note
- [ ] `services/access-control-service/CLAUDE.md`, `services/people-service/CLAUDE.md` -- document

**Acceptance Criteria:**
- Given a viewer who is the subject's assigned PP, when they request the subject's profile, then they get the full unnarrowed section view (same as an unnarrowed Reporting-line viewer)
- Given a viewer who is transitively above the PP in the PP's own reports-to chain, when they request the subject's profile, then they also qualify as PP-line
- Given a Reporting-line viewer whose own manager chain is isolated from the subject's PP's manager chain, when both lines are resolved, then `reportingLine: true` and `peoplePartnerLine: false` independently — no cross-contamination
- Given a subject with no assigned PP, when any viewer's PP-line is resolved, then it is `false`, never throwing

## Design Notes

`peoplePartnerSectionAccess` is deliberately computed by calling `ManagerSectionAccessPolicy.Resolve` with a synthetic `AccessRole { ReportingLine = true }` rather than adding a new, separate PP policy class — this is not a hack: the section matrix's PP column is cell-for-cell identical to the unnarrowed Reporting-line column today, so a second mapping would be a literal duplicate that could silently drift from the matrix if either changes independently. If a future amendment ever makes PP diverge from Reporting-line for any section, this reuse must be revisited then, not defended past that point.

## Verification

**Commands:**
- `cd services/access-control-service && dotnet build --configuration Release` -- expected: clean build
- `cd services/access-control-service && dotnet test --configuration Release` -- expected: all tests pass, including new PP-line cases (Domain/Infrastructure/Api)
- `cd services/people-service && npm run build && npm test && npm run test:e2e` -- expected: clean build, all unit + e2e tests pass
- `cd services/people-service && npx eslint "src/**/*.ts" "test/**/*.ts"` -- expected: no lint errors
