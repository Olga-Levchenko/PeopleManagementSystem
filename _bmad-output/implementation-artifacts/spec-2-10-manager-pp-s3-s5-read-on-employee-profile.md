---
title: 'Story 2.10: Manager/PP read S3 and S5 on employee profile'
type: 'feature'
created: '2026-09-12'
status: 'ready-for-dev'
review_loop_iteration: 2
baseline_commit: '84233ec'
context:
  - '{project-root}/.claude/rules/access-control-invariants.md'
  - '{project-root}/docs/access-control/section-matrix.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-6b-s3-and-self-uploads.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-9-manager-pp-s4-s9-on-employee-profile.md'
  - '{project-root}/services/people-service/CLAUDE.md'
  - '{project-root}/services/frontend/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 2.6b delivers self-service S3 emergency contacts and S5 certificate upload/read on own profile, but intentionally leaves manager/PP paths at `s3: 'None'` / `s5: 'None'` until models and download routes exist. After Story 2.9 wires manager S4/S9, a manager opening a report's profile still lacks `s3` and `s5` even though ACS already returns the correct section levels (Reporting line S3 **R**, PP S3 **RW**, Project line S3 **`—`**, S5 with project-line **CV+certificates** narrowing).

**Approach:** Mirror Story 2.9: wire manager/PP `s3`/`s5` audience levels via `mostPermissive(managerAccess, ppAccess)` (ACS parsing + FPA branch land in Story 2.6b), reuse Story 2.6b `toS3`/`toS5` assembly and auth-gated certificate download. Read-only UI on `EmployeeProfilePage` when `isSelf === false`. No new Prisma models — depends on Story 2.6b `EmergencyContact` and `PersonCertificate`.

## Boundaries & Constraints

**Always:** Server-side section gating only — profile GET omits `s3`/`s5` when resolved level is `None`; never null placeholders. Colleague path unchanged (`s3`/`s5` absent). Self branch from Story 2.6b unchanged (`s3`/`s5` ReadWrite on own profile). FPA path unchanged from Story 2.6b (`profile.ports.ts` parses `s3`/`s5`; FPA branch already wired). Wire `s3`/`s5` on **manager/PP branch only**: replace Story 2.6b placeholder `None` with `mostPermissive(managerAccess?.s3?.level, ppAccess?.s3?.level)` and same for `s5` — trust ACS narrowing (Project-line-only → `s3` None; `s5` Read with `restriction: "CV and certificates only"`). When viewer qualifies via **both** reporting and project line toward the same subject, `mostPermissive` restores S3 from the reporting line (per section-matrix most-permissive-path-wins). **S5 assembly MVP:** `PersonCertificate` rows are certificate uploads only — when `grantsSectionAccess(audience.s5)`, return cert metadata list; no other S5 document types exist yet, so project-line restriction is satisfied by returning certificates only. **Certificate download:** enable manager/PP/FPA download when `grantsSectionAccess(audience.s5)` toward subject (Story 2.6b auth-gated route; update `DOWNLOAD_CERT_MANAGER` behavior). Manager/PP **write** of S3 or uploads remains out of scope (403 on mutations). **Management profile UI is read-only for S3/S5** — even when ACS grants PP S3 ReadWrite, Emergency Contacts is a read-only list with no edit affordances; PP S3 write is a future story. Negative tests: colleague absent; project-line-only absent `s3`; project-line-only present `s5` when ACS grants narrowed Read. Update Story 2.8 trace: management profile may include `s3`/`s5` when API returns them.

**Ask First:** _(none — resolved in review loop 2: read-only management UI for S3/S5; PP RW does not expose edit affordances)_

**Never:** Self-service S3 CRUD or upload endpoints (Story 2.6b). Epic 16 full S5 document types (contract, W8, CV file separate from employee-uploaded certs). Changing ACS policies. Client-side section matrix. Weakening Story 2.6b download 404 fail-closed rule.

## Provenance

| Source | What this story closes |
|---|---|
| Spec review of `spec-2-6b` (2026-09-12) | Manager/PP read of `s3` and `s5` on profile GET — **no longer deferred** |
| `spec-2-6b` | Self models, upload pipeline, `toS3`/`toS5`, download routes — this story wires manager/PP read only |
| `spec-2-9` | Parallel pattern for wiring ACS section levels on manager/PP branch |
| `spec-2-8` AC | Extend management profile sections beyond `{ s1, s2, s10, s11, s16, s4, s9 }` to include `s3`/`s5` when entitled |
| `section-matrix.md` S3/S5 | Reporting line S3 R; Project line S3 `—`; PP S3 RW; S5 project-line CV+certs only |

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| MANAGER_REPORT_S3_S5 | Reporting line; subject has emergency contacts + certs | 200; `s3` array; `s5` cert metadata; `isSelf: false` | N/A |
| PP_LINE_S3_S5 | `peoplePartnerLine` only; ACS S3 RW / S5 RW | 200; `s3`/`s5` per PP levels | N/A |
| PROJECT_LINE_NO_S3 | `projectLine: true`, `reportingLine: false` | `s3` key absent; `s5` present when ACS S5 Read (CV+certs) | Regression vs Story 1.9 |
| PROJECT_LINE_S5_NARROWED | Project-line-only; ACS `s5` Read + restriction | 200; `s5` lists certificate rows only | N/A |
| BOTH_LINES_MOST_PERMISSIVE | Reporting + project line toward same subject | `mostPermissive` on s3/s5; reporting-line S3 Read wins over project-line S3 None | N/A |
| COLLEAGUE_NO_S3_S5 | Neither manager nor PP line | `s3`/`s5` absent | Unchanged |
| SELF_UNCHANGED | Viewer === subject | Story 2.6b self assembly unchanged | No regression |
| FPA_OTHER_SUBJECT | FPA holder | `s3`/`s5` when FPA section access grants | Story 1.5 path |
| DOWNLOAD_CERT_MANAGER | Manager with `s5` read toward subject | 200; cert bytes | 404 if no access |
| MANAGER_S3_PATCH | Manager POST subject emergency contact | 403 | Out of scope |
| PP_S3_PATCH | PP POST subject emergency contact | 403 | Out of scope; ACS may grant PP S3 RW |

</frozen-after-approval>

## Code Map

- `services/people-service/src/modules/profile/profile-audience.util.ts` — manager/PP branch: wire `s3`/`s5` via `mostPermissive`; replace Story 2.6b placeholder `None` (**`profile.ports.ts` + FPA branch delivered in 2.6b**)
- `services/people-service/src/modules/profile/profile.service.ts` — manager GET calls existing `toS3`/`toS5` when `grantsSectionAccess`; cert download allows manager when `audience.s5`
- `services/people-service/src/modules/profile/__tests__/profile-audience.util.spec.ts` — reporting/PP/project-line-only/colleague/FPA rows for s3/s5
- `services/people-service/src/modules/profile/__tests__/profile.service.spec.ts` — manager GET includes `s3`/`s5`; project-line-only no `s3`; colleague absent
- `services/people-service/test/profile.e2e-spec.ts` — mocked ACS with s3/s5 levels
- `services/frontend/src/api/profile.ts` — ensure `s3`/`s5` types exported (from 2.6b)
- `services/frontend/src/pages/EmployeeProfilePage/` — read-only Emergency Contacts + Certificates sections when keys present and `!isSelf`
- `services/frontend/e2e/all-employees-management-profile.spec.ts` — mock profile with `s3`/`s5`; assert sections visible
- `docs/access-control/section-matrix.md` — trace manager S3/S5 read + project-line S3 absent negative test

**Reuse:** Story 2.6b `EmergencyContact`/`PersonCertificate`, `toS3`/`toS5`, download module; Story 2.9 audience wiring pattern; Story 2.7/2.9 read-only section UI pattern.

## Tasks & Acceptance

**Execution:**
- [ ] `profile-audience.util.ts` — wire manager/PP `s3`/`s5` levels (replace 2.6b placeholder)
- [ ] `profile.service.ts` — manager assembly + cert download gate for `s5` read
- [ ] Unit tests — audience util + profile.service (incl. project-line-only S3 absent)
- [ ] E2E — manager profile includes s3/s5 when ACS grants access
- [ ] Playwright — management profile shows Emergency Contacts / Certificates when present
- [ ] `section-matrix.md` — coverage trace update

**Acceptance Criteria:**
- Given a manager with Reporting-line access over a subject, when they GET that subject's profile, then `s3` is present when ACS `s3` level is Read or ReadWrite
- Given a manager with project-line-only access (no reporting line), when they GET the subject's profile, then `s3` is absent and `s5` is present when ACS grants narrowed S5 read
- Given a PP with PP-line access, when they GET the subject's profile, then `s3` and `s5` are present per ACS levels
- Given a colleague viewer, when they GET another person's profile, then `s3` and `s5` are absent
- Given Story 2.6b self-view, when an employee views their own profile, then S3/S5 self-service behavior is unchanged
- Given a manager with S5 read toward a subject, when they request a certificate download URL, then the server returns 200 (not 404)
- Given a PP viewing another person's profile with S3 present, when they view Emergency Contacts, then the UI is read-only (no add/edit/delete affordances despite ACS S3 ReadWrite)

## Verification

- `npm test` in `services/people-service` (profile unit + e2e)
- `npm run test:e2e` in `services/frontend` for extended management profile spec
- `access-control-reviewer` on diff touching `profile-audience.util.ts` and download gate

## Dependencies

- Story **2.6b** **done** — `EmergencyContact`, `PersonCertificate`, `toS3`/`toS5`, upload/download infrastructure
- Story **2.8** **done** — `EmployeeProfilePage` management navigation
- **Recommended after 2.9** (same file family; can ship in either order if 2.6b is done)
- **Blocks:** none beyond completing manager profile read parity for S3/S5 within Epic 2
