---
title: 'Story 2.5: Colleague mode on All Employees'
type: 'feature'
created: '2026-09-11'
status: 'done'
review_loop_iteration: 1
baseline_commit: '8f15868'
context:
  - '{project-root}/.claude/rules/access-control-invariants.md'
  - '{project-root}/docs/access-control/section-matrix.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-1-universal-filter-column-engine-over-profile-fields.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-4-export-respects-the-exporter-s-access.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-8-colleague-view-field-whitelist.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-10-custom-field-visibility-enforcement.md'
  - '{project-root}/services/people-service/CLAUDE.md'
  - '{project-root}/services/bff/CLAUDE.md'
  - '{project-root}/services/frontend/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** All Employees ships manager/PP list, saved views, and export with interim UI gates for colleague-tier catalogs, but colleagues can still call management APIs directly, the catalog exposes non-whitelist stored/derived fields, list rows omit S10/S11 whitelist data, and row clicks do not open the limited colleague profile — violating the Epic 2 colleague-mode contract.

**Approach:** When `field-catalog.listAudienceLevel === 'colleague'`, serve a **server-enforced whitelist** catalog, filters, and row projection per the normative key table below (S1 identity fields, S10 leave **dates only**, S11 **project name only**, plus colleague-visible custom fields); return **403** on saved-view, export, and profile-field PATCH endpoints; add BFF `GET` profile proxy and a read-only colleague profile route; when catalog audience is colleague-tier, make list rows navigate to that limited profile page fed by server-assembled profile GET (Story 1.8 + 1.10), never a full profile with client-side hiding.

## Boundaries & Constraints

**Always:** Whitelist implementation — return only entitled fields in API responses; never fetch wider data and hide in the browser. Reuse `deriveAudienceFromResolution`, `grantsSectionAccess`, and Story 1.8 profile assembly for the limited profile view. One `resolveBatch` per list page unchanged. Colleague viewers keep read-only list cells (`editableFields` empty). **`listAudienceLevel` (hybrid rule, intentional):** `'management'` when the viewer's catalog-audience resolution (`resolveCatalogCustomFieldAudience`) finds **any** management-tier custom-field audience toward self or any candidate subject in the existing sample scan; `'colleague'` only when that scan finds none — a viewer who manages even one person therefore keeps saved views, export, and the full management catalog even toward subjects where row projection is colleague-tier. Server lockout: when catalog audience is `'colleague'`, `GET/POST/PATCH/DELETE /employees/saved-views` (and share routes), `GET /employees/export`, and `PATCH /people/:subjectPersonId/profile/fields` return **403** with stable error shape `{ statusCode: 403, error: 'COLLEAGUE_BROWSE_RESTRICTED', message: '<human-readable>' }` — list + field-catalog remain available. UI: hide saved-view tab bar and Export button when `listAudienceLevel === 'colleague'` (extend existing `showSavedViews` pattern); column picker offers **only** catalog-returned keys; default visible columns match the colleague whitelist table. Row click **only when** `listAudienceLevel === 'colleague'`: navigate to `/people/:personId` ColleagueProfilePage fed by `GET /people/:personId/profile`; management-tier list row click stays unchanged (no navigation in 2.5). Row grouping remains available in colleague mode (reorganizes visible rows only; does not widen catalog).

**Ask First:** Functional-role permission gate for reaching All Employees at all (stored grant vs. remaining open to any authenticated user with colleague catalog) — default: keep nav/API reachable; enforce colleague mode via catalog + 403 on management endpoints until a grant exists. Expanding `resolveCatalogCustomFieldAudience` beyond its current 10-subject sample cap — default: keep sample; document as known limitation.

**Never:** Client-side column stripping of a management catalog. Opening full profile route with hidden sections. Saved views or export for colleague-tier viewers. Hardcoded functional-role name checks. Inline edit, export UX, or saved-view UX beyond hiding/403 (owned by prior stories). **`mentorName` list column** (S1 mentor field not on `Person` today; requires S13 data) — deferred past 2.5. Timetracker live sync (Epic 14). Campaign-author S14 exception (Epic 11 extension point only).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| COLLEAGUE_CATALOG | Viewer resolves to colleague catalog audience | Catalog fields exactly match normative whitelist table; `listAudienceLevel: 'colleague'`; no `yearsWithCompany` or other management-only keys | N/A |
| COLLEAGUE_LIST_ROW | Colleague catalog audience lists employees | Row values include whitelist keys only; `leaveDates`/`projectName` per selection rules; no `leaveType`, project role/dates, or management custom values | N/A |
| COLLEAGUE_SAVED_VIEWS_API | Colleague catalog audience calls any saved-view route | 403 Forbidden | `COLLEAGUE_BROWSE_RESTRICTED` JSON |
| COLLEAGUE_EXPORT_API | Colleague catalog audience calls export | 403 Forbidden | `COLLEAGUE_BROWSE_RESTRICTED` JSON |
| COLLEAGUE_PATCH_API | Colleague catalog audience calls profile field PATCH | 403 Forbidden | `COLLEAGUE_BROWSE_RESTRICTED` JSON |
| COLLEAGUE_UI_CHROME | `listAudienceLevel=colleague` | No saved-view tabs, no Export, no inline edit affordance | List + column picker still work |
| ROW_TO_PROFILE | Colleague catalog audience clicks another person's list row | Navigate to `/people/:id`; page renders only API body keys (colleague whitelist toward that subject) | 404 when subject missing |
| ROW_TO_PROFILE_SELF | Colleague catalog audience clicks own row | Same route; profile GET uses Story 1.8 self path (employee-tier self assembly — may include S10 `leaveType` on self only) | Documented exception until Epic 3 self-profile route |
| HYBRID_CATALOG | Viewer has management line to ≥1 subject but colleague toward others | `listAudienceLevel: 'management'`; saved views/export available; row projection still per-subject via `deriveAudienceFromResolution` | N/A |
| MANAGEMENT_UNCHANGED | `listAudienceLevel=management` | Stories 2.1–2.4 behavior unchanged; no row-click profile navigation added | N/A |
| TAMPER_COLUMN_KEY | Colleague sends management-only column key in list query | 400 Bad Request via shared catalog validation — never widened values, never silent column drop | 400 |
| TAMPER_FILTER_KEY | Colleague sends management-only filter (e.g. `yearsWithCompanyMin`) | 400 or filter rejected at catalog boundary — must not infer hidden values | 400 |
| EMPTY_S10_S11 | Subject has no leaves or no project assignments | `leaveDates` and/or `projectName` cell empty/null; keys may remain columnable | N/A |

</frozen-after-approval>

## Code Map

- `services/people-service/src/modules/employees/employees.service.ts` — `getFieldCatalog()` colleague whitelist field sets; `projectPeopleToListRows()` S10/S11 list projection + org-relation S1 columns; shared `assertColleagueBrowseAllowed()` helper for 403 gates; extend `PERSON_LIST_SELECT` for leaves, assignments, manager/PP joins
- `services/people-service/src/modules/employees/employees.controller.ts` — apply colleague gate on export handler
- `services/people-service/src/modules/employees/saved-views.controller.ts` — apply colleague gate on all saved-view routes
- `services/people-service/src/modules/profile/profile.controller.ts` — apply colleague gate on `PATCH …/profile/fields`; existing `GET …/profile` (read-only consumer)
- `services/people-service/src/modules/profile/profile.service.ts` — colleague assembly (`toS10Colleague`, `toS11Colleague`) reuse
- `services/bff/src/modules/employees/employees.service.ts` — add `getProfile(subjectPersonId)` proxy to people-service profile GET
- `services/bff/src/modules/employees/employees.controller.ts` — `GET /people/:subjectPersonId/profile` route
- `services/frontend/src/router/index.tsx` — add `/people/:personId` route (colleague profile only)
- `services/frontend/src/pages/ColleagueProfilePage/` — new read-only profile view from API body keys only
- `services/frontend/src/pages/AllEmployeesPage/AllEmployeesPage.tsx` — row click navigation when colleague catalog; colleague column defaults
- `services/frontend/src/pages/AllEmployeesPage/hooks/useAllEmployeesPage.ts` — `showSavedViews` / export gates; profile navigation handler
- `services/people-service/src/modules/employees/__tests__/employees.service.spec.ts` — whitelist catalog, S10/S11 projection, negative keys, 403 helper
- `services/people-service/src/modules/employees/__tests__/saved-views*.spec.ts` + export specs — 403 when colleague catalog audience
- `services/people-service/src/modules/profile/__tests__/profile.controller.spec.ts` (or e2e) — PATCH 403 for colleague catalog audience
- `services/frontend/e2e/all-employees-colleague.spec.ts` — colleague catalog UI + hidden export/saved views + row navigation smoke
- `_bmad-output/planning-artifacts/ux-designs/ux-PeopleManagementSystem-2026-08-29/mockups/key-all-employees.html` — colleague-mode column whitelist reference

## Tasks & Acceptance

**Execution:**
- [x] `employees.service.ts` — normative colleague catalog whitelist; list row projection for S10/S11 + extended S1 keys; `assertColleagueBrowseAllowed()`; fix tests that expect `yearsWithCompany` on colleague catalog rows
- [x] `saved-views.controller.ts` + `employees.controller.ts` + `profile.controller.ts` — 403 when colleague catalog audience
- [x] `employees.service.spec.ts` + export/saved-view/profile PATCH specs — catalog whitelist, negative assertions, 403 gates, S10/S11 row value rules
- [x] `bff/.../employees` — GET profile proxy + controller route + unit test
- [x] `ColleagueProfilePage` + router — render only keys returned by API; no client-side section matrix; wire row click only when `listAudienceLevel === 'colleague'`
- [x] `AllEmployeesPage` — colleague column picker defaults per whitelist table
- [x] `all-employees-colleague.spec.ts` — Playwright smoke (hidden export, row opens limited profile toward another subject)

**Acceptance Criteria:**
- Given a viewer whose resolved catalog audience is colleague-tier, when they open All Employees, then the field catalog contains **exactly** the normative whitelist keys (stored + derived list keys + colleague-visible custom fields) and **excludes** `yearsWithCompany`, `startDate`-as-derived-filter-only keys, and all management-only custom fields
- Given that colleague viewer, when list rows are returned toward a subject with no qualifying line, then values include only whitelist keys, `leaveDates` has no leave type, `projectName` has no role or assignment dates, and management custom field values are absent
- Given a colleague-tier catalog audience, when they call saved-view, export, or profile-field PATCH APIs, then the server returns 403 with `error: 'COLLEAGUE_BROWSE_RESTRICTED'`
- Given a colleague-tier viewer on All Employees, when they click another person's row, then the app opens ColleagueProfilePage backed by `GET /profile` whose top-level keys are a subset of `{ s1, s10, s11, s16 }` with S10 entries lacking `leaveType` and S11 entries lacking `role`/`startDate`/`endDate`
- Given a colleague-tier catalog audience, when they tamper with a management-only column or filter key on the list API, then the server returns 400 and does not silently drop the key while returning widened values
- Given a viewer with any management-tier catalog audience (`listAudienceLevel === 'management'`), when they use All Employees, then Stories 2.1–2.4 behavior is unchanged and row click does not navigate to ColleagueProfilePage
- Given unit tests for colleague catalog and list projection, when executed, then negative cases assert absence of management-only catalog keys and forbidden row/profile field names (per access-control Definition of Done)

## Design Notes

### Normative colleague catalog whitelist (list + column picker)

Aligned with `key-all-employees.html` colleague mode and `section-matrix.md` (S1 full read, S10 dates-only, S11 project-name-only, S16 colleague visibility). **`mentorName` is intentionally omitted** until mentorship assignment data is available on `Person` or via S13 (tracked separately).

| Catalog key | Section | Source / notes | Filterable | Default visible |
|---|---|---|---|---|
| `fullName` | S1 | `Person.fullName` | no | yes |
| `position` | S1 | `Person.position` | no | yes |
| `departmentName` | S1 | `Person.department.name` | no | yes |
| `countryCity` | S1 | `Person.countryCity` | yes | yes |
| `workEmail` | S1 | `Person.workEmail` | no | yes |
| `workPhone` | S1 | `Person.workPhone` | no | no |
| `birthday` | S1 | `Person.birthdayMonth` + `birthdayDay` formatted `MM-DD` or empty | no | yes |
| `startDate` | S1 | `Person.startDate` ISO date | no | yes |
| `managerName` | S1 | `Person.manager.fullName` | no | yes |
| `peoplePartnerName` | S1 | `Person.peoplePartner.fullName` | no | yes |
| `leaveDates` | S10 | derived list column — see rules below | no | yes |
| `projectName` | S11 | derived list column — see rules below | no | yes |
| `custom:{id}` | S16 | active definitions with `visibility = COLLEAGUE` | yes | per UX default |

**Explicitly excluded from colleague catalog:** `yearsWithCompany`, any management/employee-only custom fields, and any future management-only derived keys (grade, risk, mentorship status, etc.).

### S10 / S11 list projection rules

**`leaveDates` (single string per row):**
1. Consider active leaves where `startDate <= today <= endDate` (inclusive on calendar dates); if multiple overlap, pick the one with the latest `startDate`.
2. Else pick the nearest future leave by earliest `startDate`.
3. Else pick the most recently ended leave by latest `endDate`.
4. Format: `YYYY-MM-DD – YYYY-MM-DD`. No leave → `null`/empty cell. **Never** include `leaveType` in list values or catalog metadata.

**`projectName` (single string per row):**
1. Consider assignments where `startDate <= today <= endDate` when both dates exist; if multiple, pick lexicographically first `projectName` (stable tie-break).
2. Else pick assignment with latest non-null `startDate`.
3. Else pick lexicographically first `projectName` among remaining rows.
4. No assignment → `null`/empty. **Never** include `role`, `startDate`, or `endDate` in list values.

**Data population caveat:** `person_project_assignments` may be empty until Epic 14 timetracker sync — empty cells are expected, not a 2.5 defect (`deferred-work.md`).

### Hybrid `listAudienceLevel` (resolved)

Epic 2 colleague **list mode** applies when the viewer has **no** management-tier relationship in the catalog-audience scan. Viewers with any management line keep management chrome (saved views, export, full catalog) while still projecting colleague row values toward unrelated subjects — per-subject resolution unchanged. The existing 10-subject sample in `collectCatalogAudienceCandidateSubjectIds` is accepted for v1; misclassification risk is documented in Ask First.

### Self-row profile exception (resolved)

Story 1.8 self path returns employee-tier profile assembly (including full S10/S11 on self). ColleagueProfilePage renders the API body as-is. A pure-colleague viewer opening **their own** row from All Employees may therefore see broader self data than they see on colleagues — accepted until Epic 3 ships a dedicated self-profile route; do **not** strip self S10/S11 in profile service for this story.

### 403 vs empty list

Saved-view **list** returns 403 (not `[]`) for colleague audience to match deferred 2.3 contract and fail closed on direct API use.

### Grouping

Colleague mode keeps row grouping (UX note in mockup) — grouping must not add columns or filters beyond the whitelist.

## Verification

**Commands:**
- `cd services/people-service && npm run lint && npm test` — colleague catalog/list/403/PATCH-gate unit tests green including negative whitelist assertions
- `cd services/bff && npm run lint && npm test` — profile GET proxy green
- `cd services/frontend && npm run lint && npx tsc -b --noEmit` — clean
- `cd services/frontend && npx playwright test e2e/all-employees-colleague.spec.ts` — colleague smoke green

## Spec Change Log

- **2026-09-11 (done):** PR #74 merged to `main` (`101a92e`); CI green; sprint/spec status → `done`; Jira O4-39 → Done.
- **2026-09-11 (draft):** Initial spec from `bmad-build` kickoff on `feature/2-5-colleague-mode-on-all-employees`; Jira O4-39 → In Progress.
- **2026-09-11 (review loop 1):** Elicitation + party-mode amendments — normative catalog key table; S10/S11 list selection/format rules; hybrid `listAudienceLevel` decision; self-row exception; PATCH 403 gate; negative ACs; `TAMPER_COLUMN_KEY` 403→400-only; `mentorName` deferred; stable `COLLEAGUE_BROWSE_RESTRICTED` error shape; context links to Stories 1.8/1.10.
- **2026-09-11 (approval):** Human-approved amended frozen intent after planning-gap audit (PROCEED WITH CONDITIONS); status → `approved`; implementation may proceed via `bmad-build` on `feature/2-5-colleague-mode-on-all-employees`.
