---
title: 'Story 4.3: Profile S6 Risk History and Authoring UI'
type: 'feature'
created: '2026-09-13'
status: 'backlog'
jira: 'O4-172'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-1-risk-record-with-retained-history.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-2-risk-dashboard.md'
  - '{project-root}/docs/access-control/section-matrix.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-PeopleManagementSystem-2026-08-29/EXPERIENCE.md'
---

# Jira-ready Ticket

**Summary:** Story 4.3: Profile S6 risk history and authoring UI

**Issue type:** Story

**Epic:** Epic 4: Risks & Risk Dashboard

**Description:** Add the Employee Profile S6 Risks section so authorized managers, project-line viewers, people partners, and Full Profile Access holders can view a person's retained risk history and append a new risk record from the profile. Story 4.1 already owns the WMS `RiskRecord` API and append-only semantics. Story 4.2 remains a read-only Risk Dashboard and must not create or edit risks.

## Intent

**Problem:** Risk records can be stored and summarized by Work Management Service, and the Risk Dashboard can list current risk posture, but there is no profile surface where an authorized viewer can inspect a single person's S6 risk history and append the next record during profile review.

**Approach:** Add a server-authorized S6 Risks section to Employee Profile. BFF proxies profile-scoped risk history and append requests to Work Management Service using the existing Story 4.1 API. People/profile responses expose the S6 section only when section access allows it. Frontend renders the current risk, trend, history, and an Add risk record form for viewers with write access and `create-edit-risks`; unauthorized audiences receive no S6 section or authoring affordance.

## Boundaries & Constraints

**Always:**
- Keep Work Management Service as the system of record for `RiskRecord`.
- Use Story 4.1 append-only semantics: no update, delete, close, resolve, or reopen operation.
- Resolve actor identity from verified auth context/service trust; never from caller-supplied body fields.
- Enforce both access role and functional permission server-side:
  - S6 relationship access: `reportingLine || peoplePartnerLine || projectLine || fullProfileAccessLine`.
  - Write gate: `create-edit-risks`.
  - Self is always denied for S6, including FPA/self combinations.
- Render no S6 section for Self, Colleague, anonymous, or unauthorized viewers.
- Preserve severity order: `low < need_attention < medium < high < leaver`.
- Treat `leaver` as a prediction only; do not modify employment status or departure state.
- Use i18n strings and accessible form validation/errors.
- Reuse dashboard/profile navigation semantics: Risk Dashboard rows drill through to `/people/:personId`; the append action lives on the profile, not on the dashboard.

**Ask First:**
- Changing section-matrix S6 access semantics.
- Adding risk notifications, employment departure automation, or a resolved/closed risk lifecycle.
- Allowing dashboard-level risk creation.
- Adding a generic profile-section authoring framework instead of a scoped S6 implementation.

**Never:**
- Expose risk data in All Employees colleague mode or Self profile responses.
- Rely on client-side hiding as the authorization boundary.
- Accept `authorPersonId`, viewer id, or permission state from the browser.
- Copy risk history into People Service persistence.
- Conflate `leaver` risk with `dismissed` employment status.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Authorized profile S6 read | Viewer has S6 relationship access to another person | Profile renders S6 section with current summary and retained history | N/A |
| Authorized append | Viewer has S6 relationship access and `create-edit-risks`; valid body | New risk record is appended; S6 section refreshes; previous history retained | Success state without exposing unrelated subjects |
| Self profile | Viewer is subject, even with FPA | No S6 section; append endpoint returns uniform `403` | No existence leak |
| Colleague/no relationship | Viewer lacks qualifying S6 relationship | No S6 section; append/read returns uniform `403` | No existence leak |
| Missing write permission | Viewer can read S6 but lacks `create-edit-risks` | History may render if read-authorized; Add action is absent/disabled per server decision; append returns `403` | No permission detail leak |
| Future recorded date | `recordedAt` is after server UTC today | `400`; no record appended | Field-level validation message |
| Invalid severity/body | Unknown level, blank/too-long description, too-long details | `400`; no record appended | Field-level validation message |
| WMS/ACS/token failure | Upstream authorization dependency unavailable | Fail closed; no risk data or append | Generic non-data error |
| Dashboard drill-through | Viewer opens profile from dashboard row | Same current risk semantics and history appear on profile | Profile remains server-authorized |

## Contract & Data Semantics

- BFF exposes profile-scoped endpoints for the frontend, backed by WMS:
  - `GET /api/v1/people/:subjectPersonId/risks` returns Story 4.1 `{ summary, records }` for an authorized viewer.
  - `POST /api/v1/people/:subjectPersonId/risks` appends a new record using Story 4.1 semantics. Body: `level`, `description`, optional `details`, optional `recordedAt`.
- WMS remains authoritative:
  - Existing `GET /api/v1/risks?subjectPersonId=...` and `POST /api/v1/risks` are reused or wrapped by BFF.
  - `authorPersonId` is the verified viewer resolved server-side.
  - `subjectPersonId` is the route/body target only, never the actor.
- People Service may expose a profile section-access signal or continue omitting S6 until BFF/front-end risk section can be server-authorized. Do not persist risk records in People Service.
- Frontend treats `403` as S6 capability absence for profile section rendering, not as a named data error visible to unauthorized users.

## Code Map

- `services/work-management-service/src/modules/risks/` — reuse Story 4.1 risk history and append handlers; add only narrowly needed contract/test adjustments if current routes cannot support BFF profile proxy cleanly.
- `services/bff/src/modules/` — add a profile risks proxy module or extend the People/Profile proxy module; exchange/forward auth to WMS with the correct audience; normalize upstream `403`/`400` behavior.
- `services/people-service/src/modules/profile/` and/or `services/people-service/src/modules/employees/` — preserve server-assembled section omission; add S6 section affordance metadata only if needed and only from access-controlled service decisions.
- `services/frontend/src/pages/EmployeeProfilePage/` — add S6 Risks section, current summary, history table/list, Add risk record form, validation, loading, empty, and generic failure states.
- `services/frontend/src/api/` — add risk-history and append clients/hooks; preserve cancellation/query invalidation patterns.
- `services/frontend/src/locales/en/translation.json` — add S6 risk section and form strings.
- `docs/access-control/section-matrix.md` — update test coverage note for S6 profile read/append once implemented.

## Tasks & Acceptance

**Execution:**
- [ ] BFF exposes authenticated profile risk history and append endpoints backed by WMS, using correct token audience and fail-closed upstream handling.
- [ ] Employee Profile renders the S6 Risks section only for server-authorized non-self viewers.
- [ ] S6 section shows current level, trend, recorded date, description/details history, and empty state.
- [ ] Add risk record form posts `level`, `description`, optional `details`, and optional `recordedAt`; validates future dates, required fields, and max lengths.
- [ ] Successful append refreshes the S6 section and preserves history.
- [ ] Risk Dashboard remains read-only and drills through to the profile for profile-scoped review/append.
- [ ] Access-control documentation/test trace is updated for S6 profile read/append coverage.

**Acceptance Criteria:**
- Given a viewer with S6 relationship access to another person and the `create-edit-risks` permission, when they open the Employee Profile, then they see S6 current risk, retained history, trend, and an Add risk record action.
- Given that viewer submits a valid new risk record, when the save succeeds, then a new append-only `RiskRecord` is created in WMS, the profile S6 section refreshes, and previous records remain visible as history.
- Given Self, Colleague, anonymous, no qualifying S6 relationship, or failed authorization dependency, when profile risk data is requested, then no S6 data or authoring affordance is returned or rendered.
- Given a viewer lacks `create-edit-risks`, when they can otherwise read S6, then they can inspect authorized history but cannot append a new record.
- Given `leaver` is selected, when it is saved or displayed, then it is treated only as a risk prediction and does not change employment status.

## Design Notes

The profile is the authoring surface. The dashboard is a discovery and triage surface. This keeps Story 4.2 read-only and aligns with the section matrix: S6 is a profile section with RW access for management/project/PP/FPA audiences and no Self/Colleague visibility.

## Verification

**Commands:**
- `cd services/work-management-service && npm test` — expected: Story 4.1 risk append/history regression tests still pass.
- `cd services/bff && npm test` — expected: profile risk proxy authorization, upstream status, and validation tests pass.
- `cd services/people-service && npm test` — expected: profile section omission/metadata tests pass, especially Self and Colleague S6 absence.
- `cd services/frontend && npm test && npx playwright test e2e/profile-risks.spec.ts` — expected: authorized S6 history/append flow, unauthorized omission, validation, and dashboard drill-through coverage pass.

**Manual smoke scenario:**
1. Log in as a seeded management/PP user with `create-edit-risks`.
2. Open Risk Dashboard and drill through to a listed person's profile, or open an accessible profile directly.
3. Confirm S6 Risks section renders for an authorized non-self subject.
4. Add a `high` or `need_attention` risk with description and today's date.
5. Confirm the new record appears in history and the current summary updates.
6. Log in as the employee/self or a colleague and confirm S6 is absent.
