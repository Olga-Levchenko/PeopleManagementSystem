---
title: 'Story 2.8: Management list row navigation to Employee Profile'
type: 'feature'
created: '2026-09-11'
status: 'in-progress'
review_loop_iteration: 0
baseline_commit: ''
context:
  - '{project-root}/.claude/rules/access-control-invariants.md'
  - '{project-root}/docs/access-control/section-matrix.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-1-universal-filter-column-engine-over-profile-fields.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-5-colleague-mode-on-all-employees.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-PeopleManagementSystem-2026-08-29/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-PeopleManagementSystem-2026-08-29/mockups/key-employee-profile.html'
  - '{project-root}/services/people-service/CLAUDE.md'
  - '{project-root}/services/bff/CLAUDE.md'
  - '{project-root}/services/frontend/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 2.5 deliberately left management-mode All Employees rows non-navigable (`MANAGEMENT_UNCHANGED`). UM/DM/PP viewers with `listAudienceLevel === 'management'` therefore cannot open an employee profile from the list, while plain colleagues can — an inverted UX gap called out in Story 2.1's deferred-work entry ("Profile navigation link from All Employees list rows; browse-to-profile journey incomplete"). The profile GET API and BFF proxy already exist; only the management browse journey and a section-faithful Employee Profile UI shell are missing.

**Approach:** When `field-catalog.listAudienceLevel === 'management'`, make list rows navigate to `/people/:personId` on row click (same route as Story 2.5). Replace the colleague-only `ColleagueProfilePage` with a unified **`EmployeeProfilePage`** that renders **only** top-level keys present in `GET /people/:subjectPersonId/profile` — never client-side section hiding. Reuse the existing profile assembly (Stories 1.6, 1.8, 1.10): management/PP/FPA viewers see fuller S10/S11 than colleagues; absent keys stay absent from the DOM. Stop row navigation when the user interacts with an inline-editable cell (Story 2.2).

## Boundaries & Constraints

**Always:** Server-assembled profile only — the page is a faithful renderer of `ProfileResponse` keys (`s1`, `s2`, `s10`, `s11`, `s16` today). Section omission rule: if a section key is absent from the API body, do not render that section at all (not empty placeholders implying hidden data). One shared route `/people/:personId` for colleague and management audiences; audience differences come from the API, not separate routes or client-side matrix logic. Row click when `listAudienceLevel === 'management'`; preserve Story 2.5 colleague row-click behavior unchanged. `cursor-pointer` + hover affordance on management rows. Back navigation to `/all-employees`. Inline-edit cell clicks must `stopPropagation` so PATCH-on-blur still works without navigating away. Reuse `useColleagueProfile` hook or rename to neutral `useEmployeeProfile` — same BFF `GET /api/v1/people/:id/profile` call. Playwright: management catalog row click navigates and renders returned sections; colleague catalog regression unchanged.

**Ask First:** Whether to fold this into Epic 2 as **Story 2.8** (recommended — closes the 2.1 deferral before Epic 4/5 dashboard drill-through) vs. a new epic — default: **2.8**, sequenced after **2.5** lands. Whether `ColleagueProfilePage` is deleted in favour of `EmployeeProfilePage` or kept as a thin wrapper — default: **single `EmployeeProfilePage`**, delete colleague-only duplicate once parity is verified. Expanding `ProfileResponse` beyond `{ s1, s2, s10, s11, s16 }` — default: **out of scope**; render only what the API already returns.

**Never:** Client-side section matrix or denylist rendering ("hide S2 tab"). Hardcoded functional-role name checks (`"UM"`, `"DM"`, …). A second profile route for managers. Opening management profile navigation only for some management relationships — any `listAudienceLevel === 'management'` viewer gets row click toward any listed subject (row values and profile GET remain per-subject access-gated server-side). Profile-page inline editing, S3/S4/S6/S7/S8+ sections, organisational-relationship edits, or self-service flows (owned by Stories 2.6–2.7 and later epics). Changing colleague browse 403 gates from Story 2.5. Replacing list inline edit with profile-page edit in this story.

## Provenance

| Source | What it deferred or excluded |
|---|---|
| `deferred-work.md` (from spec-2-1 code review, 2026-09-10) | "Profile navigation link from All Employees list rows" — UX polish beyond 2.1 core ACs |
| `spec-2-1` review defer | `[Review][Defer] No profile navigation from list rows` — browse-to-profile journey incomplete |
| `spec-2-5` I/O `MANAGEMENT_UNCHANGED` | `listAudienceLevel=management` → Stories 2.1–2.4 unchanged; **no row-click profile navigation added** |
| `spec-2-5` AC | Management-tier viewer → row click does **not** navigate to ColleagueProfilePage (this story adds navigation to the unified Employee Profile instead) |
| `EXPERIENCE.md` IA | Employee Profile reached from "All Employees row click"; one page, many audiences, sections differ by API |
| `project-requirements.md` §4.1 | Colleague mode: row opens limited profile (done in 2.5). Manager mode: same page, fuller entitlements — implied by §4.2 profile assembly |

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| MANAGEMENT_ROW_CLICK | `listAudienceLevel=management`; viewer clicks non-editable cell on another person's row | Navigate to `/people/:id`; `EmployeeProfilePage` renders only keys returned by profile GET | 404 page when subject missing |
| MANAGEMENT_ROW_SELF | Management catalog audience clicks own row | Same route; profile GET uses Story 1.6 self assembly (employee-tier toward self) | N/A |
| MANAGEMENT_INLINE_EDIT | Management viewer clicks/blurs an inline-editable cell | PATCH fires; row does **not** navigate | Existing 2.2 error handling |
| COLLEAGUE_UNCHANGED | `listAudienceLevel=colleague` | Row click still navigates; same `EmployeeProfilePage`; API returns colleague whitelist keys only | N/A |
| HYBRID_ROW_PROJECTION | Management catalog; viewer is colleague toward subject X on list page | Row click opens profile; GET toward X returns colleague-tier sections only | N/A |
| ABSENT_SECTION | Viewer lacks S2 toward subject | Response omits `s2` key; UI renders no S2 block | N/A |
| S10_S11_MANAGEMENT | Manager line toward subject | S10 includes `leaveType`; S11 includes `role`/dates when API provides them | N/A |
| S16_EMPTY | No visible custom fields | `s16: []` may render empty state or omit block per UX — must not imply hidden fields exist | N/A |
| NO_NAV_WHEN_LOADING | List still loading | Rows not clickable until list query succeeds | N/A |

</frozen-after-approval>

## Code Map

- `services/frontend/src/pages/AllEmployeesPage/AllEmployeesPage.tsx` — enable row `onClick` when `listAudienceLevel === 'management'` (or always when not editing); pointer/hover styles for management rows
- `services/frontend/src/pages/AllEmployeesPage/hooks/useAllEmployeesPage.ts` — expose `isManagementBrowseMode` or unified `isRowNavigationEnabled`; navigation handler
- `services/frontend/src/pages/AllEmployeesPage/InlineEditableCell.tsx` — `stopPropagation` on interactive controls so row click does not fire during inline edit
- `services/frontend/src/pages/EmployeeProfilePage/` — new unified profile page (absorb `ColleagueProfilePage` sections + S2 when present)
- `services/frontend/src/pages/ColleagueProfilePage/` — remove or re-export from `EmployeeProfilePage` after migration
- `services/frontend/src/api/hooks/useColleagueProfile.ts` — rename to `useEmployeeProfile.ts` (optional cleanup)
- `services/frontend/src/router/index.tsx` — route `/people/:personId` → `EmployeeProfilePage`
- `services/frontend/e2e/all-employees-export.spec.ts` — **update** test `management catalog row click does not navigate` → assert navigation to profile instead
- `services/frontend/e2e/all-employees-management-profile.spec.ts` — new Playwright smoke: management row click, S10/S11 fuller shape when mocked
- `services/frontend/e2e/all-employees-colleague.spec.ts` — regression: colleague row click still works after page unification

**No backend changes required** unless profile GET gaps are discovered during implementation — default assumption: `ProfileService.getProfile` + BFF proxy are sufficient for management browse.

## Tasks & Acceptance

**Execution:**
- [x] `EmployeeProfilePage` — render `s1`, `s2`, `s10`, `s11`, `s16` blocks only when corresponding keys exist in API response; header shows `s1.fullName`, manager/PP from `s1` when present
- [x] `AllEmployeesPage` — management row click navigation; hover/cursor affordance for both audience modes
- [x] `InlineEditableCell` — stop row navigation on edit interaction
- [x] Router — point `/people/:personId` at `EmployeeProfilePage`; remove duplicate colleague-only page
- [x] `all-employees-management-profile.spec.ts` — Playwright smoke
- [x] Update `all-employees-export.spec.ts` management row-click expectation
- [x] `all-employees-colleague.spec.ts` — confirm colleague journey still passes

**Acceptance Criteria:**
- Given a viewer with `listAudienceLevel === 'management'`, when they click another person's row on All Employees (outside an inline-edit control), then the app navigates to `/people/:personId` and renders an Employee Profile backed by `GET /profile`
- Given that management viewer and a subject they hold Manager/PP access over, when the profile loads, then the page includes every section key the API returns (at minimum the Story 1.6/1.8/1.10 set among `{ s1, s2, s10, s11, s16 }`) and omits every absent key with no client-side matrix
- Given a management viewer, when they interact with an inline-editable list cell, then the row click handler does not fire and Story 2.2 PATCH behavior is unchanged
- Given a viewer with `listAudienceLevel === 'colleague'`, when they click a row, then Story 2.5 behavior is unchanged (same route, colleague-tier API body, no saved views/export regression)
- Given Playwright tests for management and colleague row navigation, when executed, then management asserts navigation + rendered sections from mock profile GET; colleague regression passes

## Design Notes

### Unified page vs. two pages

`EXPERIENCE.md` specifies **one** Employee Profile component for all audiences. Story 2.5 shipped `ColleagueProfilePage` as a minimal first slice. This story generalizes it: same URL, richer rendering when the API returns more keys. Do not branch on `listAudienceLevel` in the profile page — branch on **`Object.keys(profileResponse)`** only.

### Section rendering rules (v1 slice)

Align layout with `key-employee-profile.html` section cards. For the API slice implemented today:

| Key | When rendered | Management vs colleague difference |
|---|---|---|
| `s1` | Key present | Same identity card fields |
| `s2` | Key present | Management/PP may see; colleague never receives key |
| `s10` | Key present | Management: dates + `leaveType`; colleague: dates only |
| `s11` | Key present | Management: name + role/dates; colleague: name only |
| `s16` | Key present (may be `[]`) | Per-field visibility already applied server-side |

### Relationship to Stories 2.6–2.7

Self-service (S2/S3 writes, S4/S9/S10/S11 self-read, S6 self-exclusion) targets the **same** profile route when the viewer is the subject. This story delivers the **read-only shell and management browse entry point**; 2.6–2.7 add write affordances on the profile page for self only. Sequence: **2.5 → 2.8 → 2.6/2.7** recommended so managers can browse before self-edit ships.

### Relationship to Epic 4/5 drill-through

Stories **4.2** (Risk Dashboard) and **5.x** dashboards assume "from a row to the profile." This story unblocks that pattern for All Employees; dashboard stories should link to the same `/people/:personId` route.

### Planning artifacts

Registered 2026-09-11:

- `epics.md` — Story 2.8 under Epic 2
- `sprint-status.yaml` — `2-8-management-list-row-navigation-to-employee-profile: backlog`
- `epic-2-context.md` — story list + dependency note
- `deferred-work.md` — Story 2.1 profile-navigation deferral claimed by Story 2.8
- Jira **O4-168** — Story 2.8: Management list row navigation to Employee Profile (parent epic **O4-11**)
