---
title: 'Story 2.6b: S3 emergency contacts and self uploads (photo + certificates)'
type: 'feature'
created: '2026-09-12'
status: 'ready-for-dev'
review_loop_iteration: 3
baseline_commit: '84233ec'
context:
  - '{project-root}/.claude/rules/access-control-invariants.md'
  - '{project-root}/docs/access-control/section-matrix.md'
  - '{project-root}/docs/decisions/ADR-004-epic-2-open-decisions.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-6-self-managed-personal-data.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-7-self-read-of-managed-data-and-never-own-risk-level.md'
  - '{project-root}/services/people-service/CLAUDE.md'
  - '{project-root}/services/bff/CLAUDE.md'
  - '{project-root}/services/frontend/CLAUDE.md'
  - '{project-root}/infra/docker-compose.yml'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 2.6 (done) delivered S2 self-edit only. Epic 2 / FR-13 AC still requires employees to maintain S3 emergency contacts and upload their own photo and certificates. `deferred-work.md` carved these out; ADR-004 Decision 2 accepts **local Docker volume storage** owned by `people-service` (not MinIO for now).

**Approach:** Add `EmergencyContact` records (S3) with self-service CRUD on own profile only. Extend `ResolvedProfileAudience` with `s3` and `s5` levels (self `ReadWrite` on both; colleague `None`). Extend `ProfileSectionAccessGroup` / `parseSectionAccessGroup` in `profile.ports.ts` to parse ACS `s3`/`s5` and wire the **FPA branch** via `mostPermissive(fullAccess.s3?.level)` / `s5` (same pattern as `s4`/`s9`); manager/PP toward others remain `None` until Story 2.10. Add upload pipeline: multipart upload endpoint stores files under a configured volume path, persists references on `Person.photoUrl` (S1) and a new `PersonCertificate` (or equivalent) table for S5 certificate slice. Serve binaries only through **authenticated, section-gated download routes** (never public static URLs). Expose read models on profile GET (`s3` array, updated `s1.photoUrl`, `s5` certificates list or minimal certificate metadata). BFF proxies upload + JSON endpoints. Frontend: Emergency Contacts section and upload controls on own profile only.

## Boundaries & Constraints

**Always:** Self-write only for S3 and uploads when `viewerPersonId === subjectPersonId`; server rejects cross-subject writes with 403. No manager/PP edit of another person's S3 or uploads through these endpoints. File storage per ADR-004 option 1: `UPLOAD_STORAGE_PATH` (or equivalent) on a Docker volume in `infra/docker-compose.yml`; `photoUrl` and certificate metadata store an opaque `storageKey` or people-service download path — **not** a publicly reachable bucket URL. **Legacy `photoUrl` migration (frozen):** pre-existing `Person.photoUrl` values that are not a recognized gated-download reference / `storageKey` (e.g. legacy `https://…` strings from seeds or tests) are treated as **no photo** on profile GET (`s1.photoUrl` omitted or null) and must not be served by the download route; only uploads through this story's pipeline persist gated references. **Authenticated download (fail-closed):** every file download re-resolves audience for `(viewerPersonId, subjectPersonId)`; photo bytes require `grantsSectionAccess(audience.s1)`; certificate bytes require `grantsSectionAccess(audience.s5)`; missing/invalid JWT or insufficient section access → **404 Not Found** (not 403, to avoid existence leak). **Path traversal (frozen):** resolve `storageKey` only inside `UPLOAD_STORAGE_PATH`; reject `..`, absolute paths, path separators outside the allowlist, and any key not owned by `subjectPersonId` — return **404** (same fail-closed rule). **Upload limits (frozen):** photo max **5 MB** (`MAX_PHOTO_UPLOAD_BYTES`); certificate max **10 MB** (`MAX_CERTIFICATE_UPLOAD_BYTES`); allowed MIME types only **`image/jpeg`**, **`image/png`**, **`application/pdf`** — validate `Content-Type` and magic bytes server-side; constants in people-service config/Joi schema. **BFF body-size limits** must match people-service (≥ 10 MB for certificate proxy). Pseudonymised filenames in tests/fixtures only. S3 fields per matrix: contact person name, relationship, phone (nullable strings). Certificate upload attaches to **own** record only (S5 self slice); self may **delete** own certificate rows (DB + file). **ACS parser + audience (`profile.ports.ts`, `profile-audience.util.ts`):** extend `ProfileSectionAccessGroup` and `parseSectionAccessGroup` with `s3`/`s5`; extend `ResolvedProfileAudience` with `s3` and `s5`; self branch → `s3: 'ReadWrite'`, `s5: 'ReadWrite'`; colleague branch → `s3: 'None'`, `s5: 'None'`; **FPA branch** → `s3`/`s5` from `fullProfileAccessSectionAccess` via `mostPermissive` (same as `s4`/`s9`); manager/PP toward others → `s3: 'None'`, `s5: 'None'` until **Story 2.10** wires manager/PP ACS levels (placeholder — not a permanent deny). Profile GET omits `s3`/`s5` keys when resolved level is `None`. Photo upload requires self + `grantsSectionWriteAccess(audience.s1)` (matrix: Self photo RW on S1). **Colleague browse gate bypass (Story 2.6 parity):** on profile-scoped S3 CRUD and upload mutations, when `actorId === subjectPersonId`, skip `ColleagueBrowseGateService.assertManagementBrowseAllowed` — gate unchanged for non-self callers. Replace photo deletes prior `storageKey` file; certificate delete removes DB row and file. Reuse `profile.isSelf` for UI.

**Ask First:** _(none — resolved in review loop 2)_

**Out of scope (Story 2.10):** Manager/PP **read** assembly of `s3`/`s5` on another person's profile GET and manager certificate download — owned by `spec-2-10-manager-pp-s3-s5-read-on-employee-profile.md` (not deferred work).

**Never:** MinIO/S3 cloud storage (ADR-004 explicitly deferred). Messengers / place of stay (separate deferred item). Manager upload on behalf of employee. Client-side-only upload validation. Storing raw file bytes in Postgres. Epic 16 employment facts.

## Provenance

| Source | What this story closes |
|---|---|
| `deferred-work.md` (Story 2.6 split) | S3 self-edit; photo upload; certificate upload |
| `epics.md` Story 2.6 AC | S3 writes; photo; certificate upload |
| `ADR-004` Decision 2 (accepted) | Local volume storage in people-service |
| `section-matrix.md` S3 | Self RW; S5 self upload certificates |
| `spec-2-10` | Manager/PP S3/S5 read on profile GET (follow-up; depends on 2.6b models) |

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| SELF_S3_CREATE | Viewer === subject; POST/PATCH emergency contact | 201/200; contact persisted | 403 if not self |
| SELF_S3_DELETE | Viewer === subject; delete own contact | 204 | 403 if not self |
| SELF_S3_COLLEAGUE_CATALOG | `listAudienceLevel=colleague`; viewer === subject; valid S3 mutation | 200/201/204; colleague browse gate bypassed | Must not return `COLLEAGUE_BROWSE_RESTRICTED` |
| SELF_PHOTO_UPLOAD | Viewer === subject; multipart image ≤5 MB, jpeg/png | 200; `photoUrl` updated to gated download reference; prior file removed | 400 invalid type/size |
| SELF_CERT_UPLOAD | Viewer === subject; multipart PDF/image ≤10 MB | 200; certificate row created | 400 invalid type/size |
| SELF_CERT_DELETE | Viewer === subject; delete own certificate by id | 204; DB row + file removed | 403 if not self; 404 if unknown id |
| SELF_UPLOAD_COLLEAGUE_CATALOG | Colleague catalog; viewer === subject; valid upload | 200; gate bypassed on upload route | Must not return `COLLEAGUE_BROWSE_RESTRICTED` |
| PHOTO_URL_LEGACY | `Person.photoUrl` is legacy external URL (pre-migration) | Profile GET omits or nulls photo; download route 404 | No migration backfill required |
| DOWNLOAD_PHOTO_SELF | Viewer === subject; valid `storageKey` | 200; image bytes | 404 if key unknown |
| DOWNLOAD_PATH_TRAVERSAL | Valid JWT; `storageKey` contains `..` or wrong-person key | 404 | Fail closed; no file read |
| DOWNLOAD_PHOTO_MANAGER | Manager with S1 read toward subject; valid key | 200; photo bytes (S1 already on profile GET) | 404 if no `s1` access or unknown key |
| DOWNLOAD_CERT_MANAGER | Manager toward subject; valid cert key | 404 until Story 2.10 enables `s5` read download | 404 not 403 |
| DOWNLOAD_UNAUTHENTICATED | No bearer token | 404 | Fail closed |
| OTHER_S3_WRITE | Manager PATCH subject S3 | 403 | No bypass |
| OTHER_UPLOAD | Manager uploads to subject | 403 | N/A |
| PROFILE_GET_SELF | Viewer === subject | `s3` array present; `s1.photoUrl` if set; `s5` cert metadata when uploaded | N/A |
| PROFILE_GET_MANAGER | Manager reporting line toward subject | `s3`/`s5` absent until Story 2.10 | No leak |
| PROFILE_GET_COLLEAGUE | Colleague toward subject | `s3`/`s5` absent | No leak |
| FPA_OTHER_SUBJECT_S3_S5 | FPA holder viewing another person; ACS grants s3/s5 | 200; `s3`/`s5` when entitled | Story 1.5 path |
| MISSING_VOLUME | `UPLOAD_STORAGE_PATH` not writable | 503 on upload | Fail closed |

</frozen-after-approval>

## Code Map

- `infra/docker-compose.yml` + `infra/.env.example` — volume mount for people-service uploads; `UPLOAD_STORAGE_PATH`
- `services/people-service/prisma/schema.prisma` — `EmergencyContact` model; `PersonCertificate` (or `Certificate`) with `personId`, `fileName`, `storageKey`, `uploadedAt`
- `services/people-service/prisma/migrations/` — new migration
- `services/people-service/src/modules/profile/profile.ports.ts` — add `s3`/`s5` to `ProfileSectionAccessGroup` + `parseSectionAccessGroup` (FPA + future 2.10 manager/PP levels)
- `services/people-service/src/modules/profile/profile-audience.util.ts` — add `s3`/`s5` to `ResolvedProfileAudience`; self `ReadWrite`, FPA from `fullProfileAccessSectionAccess`, colleague/manager-for-others `None` (Story 2.10 wires manager/PP read)
- `services/people-service/src/modules/profile/profile.controller.ts` — skip `ColleagueBrowseGateService` on self S3 CRUD + upload routes (mirror Story 2.6 PATCH)
- `services/people-service/src/modules/profile/` or dedicated `uploads/` module — multipart handler, path sanitization, **JWT + audience-gated** download route(s)
- `services/people-service/src/modules/profile/profile.service.ts` — assemble `s3`, `s5` cert metadata when `grantsSectionAccess`; gate photo upload on `s1` write; extend `ProfileResponse` types
- `services/people-service/src/config/` — `MAX_PHOTO_UPLOAD_BYTES`, `MAX_CERTIFICATE_UPLOAD_BYTES`, allowed MIME allowlist
- `services/bff/` — proxy multipart upload + download routes (auth header forwarding; align body-size limits with people-service)
- `services/frontend/src/api/profile.ts` — `S3EmergencyContact`, `S5Certificate` types; upload API helpers
- `services/frontend/src/pages/EmployeeProfilePage/` — Emergency Contacts section; photo + certificate upload UI (self only)
- `services/frontend/e2e/employee-profile-self-edit.spec.ts` — extend or add upload/S3 cases (mock multipart or test fixture)
- `docs/access-control/section-matrix.md` — trace Self S3 RW + download 404 negative tests

## Tasks & Acceptance

**Execution:**
- [ ] Prisma models + migration + seed-safe defaults
- [ ] Upload storage config + docker volume + frozen size/MIME constants
- [ ] `profile.ports.ts` — parse `s3`/`s5` from ACS wire shape
- [ ] `profile-audience.util.ts` — `s3`/`s5` on `ResolvedProfileAudience` (self, FPA, colleague; manager/PP placeholder `None`)
- [ ] Self S3 CRUD API + profile GET assembly (`s3`/`s5` when entitled)
- [ ] Photo + certificate upload endpoints + persistence + replace/delete file lifecycle
- [ ] Auth-gated download route(s) — 404 for unauthenticated or wrong audience
- [ ] `profile.controller.ts` — colleague-gate bypass on self S3/upload mutations
- [ ] BFF proxy routes + auth forwarding + body-size limits
- [ ] Frontend sections + Playwright smoke
- [ ] Unit/e2e tests; negative 403 non-self mutations; negative 404 download leaks

**Acceptance Criteria:**
- Given an employee on their own profile, when they add or edit emergency contacts (S3), then changes persist without manager/PP involvement
- Given an employee in colleague catalog mode, when they mutate own S3 or upload on the profile route, then colleague browse gate does not block them (Story 2.6 parity)
- Given an employee on their own profile, when they upload a photo within size/MIME limits, then `photoUrl` is set and displayed on the identity card
- Given an employee on their own profile, when they upload a certificate within size/MIME limits, then a certificate record is created and listed under `s5`
- Given an employee on their own profile, when they delete an uploaded certificate, then the certificate row and stored file are removed
- Given a legacy external `photoUrl` on a Person row, when any viewer GETs the profile or requests download, then no photo is exposed until a new gated upload replaces it
- Given any viewer who is not the subject, when they attempt S3 or upload mutations, then the server returns 403
- Given an unauthenticated request or a viewer without section access, when they request a stored photo or certificate download URL, then the server returns 404
- Given local dev via `infra/docker-compose.yml`, when a file is uploaded, then it is stored on the configured volume per ADR-004

## Verification

- `npm run db:deploy` + `npm test` + `npm run test:e2e` in `people-service`
- BFF proxy tests for upload route
- Frontend typecheck + Playwright self-profile spec
- Manual: bootstrap + upload photo on own profile in browser

## Dependencies

- Story 2.6 and 2.7 **done** (profile route, self S2, read models)
- ADR-004 Decision 2 **accepted** — no further storage ADR required
- **Blocks:** none for Epic 3 start, but required for FR-13 closure within Epic 2
