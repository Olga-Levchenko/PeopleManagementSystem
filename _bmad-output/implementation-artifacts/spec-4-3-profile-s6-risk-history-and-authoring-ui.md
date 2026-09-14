---
title: 'Story 4.3: Profile S6 Risk History and Authoring UI'
type: 'feature'
created: '2026-09-14'
status: 'review'
review_loop_iteration: 0
baseline_commit: 'fd74f449304f2b66df8f03abf840c912085dac49'
jira: 'O4-172'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-1-risk-record-with-retained-history.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-2-risk-dashboard.md'
  - '{project-root}/docs/access-control/section-matrix.md'
---

<frozen-after-approval reason="human-owned intent - do not modify unless human renegotiates">

## Intent

**Problem:** Risk records and the read-only Risk Dashboard exist, but Employee Profile has no S6 surface for an authorized viewer to inspect one person's retained risk history or append the next record during review.

**Approach:** Add a profile-scoped S6 Risks read and append path through BFF to Work Management Service, then render the S6 section on Employee Profile only when the server authorizes it. History read is allowed for qualifying S6 relationships; append additionally requires the runtime `create-edit-risks` permission. This story intentionally narrows the Story 4.1 WMS permission model for profile history reads: S6 profile read is relationship-gated, while S6 profile append remains relationship + permission gated.

## Boundaries & Constraints

**Always:** Work Management Service remains the `RiskRecord` system of record; use Story 4.1 append-only semantics with no update/delete/close/reopen lifecycle. Resolve actor identity from verified auth context/service trust, never browser-supplied actor fields. Self is denied for S6 even with FPA. S6 read requires `reportingLine || peoplePartnerLine || projectLine || fullProfileAccessLine`; S6 append also requires `create-edit-risks`. Unauthorized, anonymous, self, colleague, ACS failure, and token-exchange failure states must expose no S6 data or authoring affordance. WMS data failure after authorization must expose no risk data but should render a generic request-failure state rather than capability absence. `leaver` remains only a risk prediction.

**Ask First:** Changing section-matrix S6 semantics, dashboard-level risk creation, risk notifications, employment departure automation, a resolved/closed risk lifecycle, or a generic profile-section authoring framework.

**Never:** Expose risk data in Self or All Employees colleague mode, rely on client-side hiding as the authorization boundary, accept `authorPersonId`/viewer id/permission state from the browser, copy risk history into People Service persistence, or conflate `leaver` with `dismissed`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Authorized S6 read | Viewer has qualifying S6 relationship to another person | Profile renders current risk summary, trend, retained history, and empty state when no records exist | N/A |
| Authorized append | Viewer also has `create-edit-risks`; valid level/description/details/recordedAt | WMS appends one record; profile risk query refreshes; previous records remain visible | Success state scoped to the subject |
| Read without write permission | Viewer has S6 relationship but lacks `create-edit-risks` | History renders; Add action is absent | Append returns uniform `403` |
| Unauthorized/self/colleague | Viewer is subject or lacks qualifying S6 relationship | No S6 section or authoring affordance | Read/append return uniform `403` with no existence leak |
| Invalid append body | Future `recordedAt`, unknown level, blank or too-long description/details | No record appended | `400` with field-level form message |
| Authorization dependency failure | ACS or token exchange unavailable or denies | Fail closed; no S6 risk data rendered and no Add affordance | Uniform `403` or capability absence |
| WMS data failure after authorization | BFF can authorize the viewer but WMS read/append fails unexpectedly | No S6 risk data rendered or stale success implied | Generic request-failure state, not capability absence |

</frozen-after-approval>

## Code Map

- `services/work-management-service/src/modules/risks/risks.controller.ts` -- existing `GET /api/v1/risks?subjectPersonId=...` and `POST /api/v1/risks`; keep append body shape and reuse for BFF profile proxy.
- `services/work-management-service/src/modules/risks/risks.service.ts` -- `assertCanAccessSubject` currently gates both read and append on `hasCreateEditRisksPermission`; split into read relationship gate and append write-permission gate so read-without-write works.
- `services/work-management-service/src/modules/risks/dto/create-risk-record.dto.ts` and `__tests__/create-risk-record.dto.spec.ts` -- existing level/description/details/recordedAt validation and future-date service rejection coverage to preserve/extend.
- `services/bff/src/modules/employees/people.controller.ts` and `employees.service.ts` -- profile proxy pattern with session token exchange for `people-service`; add profile risks endpoints here or a tightly-scoped sibling service that exchanges for `work-management-service`.
- `services/bff/src/modules/risk-dashboard/risk-dashboard.controller.ts` and `risk-dashboard.service.ts` -- existing WMS + People token exchange and uniform upstream handling patterns; reuse error/status treatment for risk profile proxy.
- `services/frontend/src/api/profile.ts` and `src/api/hooks/useEmployeeProfile.ts` -- profile API types and query key; add risk history/append types and mutation hook with invalidation of `['people','profile',personId]` plus risk S6 query.
- `services/frontend/src/pages/EmployeeProfilePage/EmployeeProfilePage.tsx` -- current profile section composition; add S6 section for authorized non-self risk response, keeping server response/403 authoritative.
- `services/frontend/src/pages/RiskDashboardPage/RiskDashboardPage.tsx` and `src/api/riskDashboard.ts` -- reuse `RiskSeverity`, trend direction, severity ordering, text labels, and row navigation to `/people/:personId`.
- `services/frontend/src/locales/en/translation.json` -- add S6 section, severity, trend, form, validation, save, empty, and generic error strings.
- `docs/access-control/section-matrix.md` -- update S6 profile read/append test trace after coverage is added.

## Tasks & Acceptance

**Execution:**
- [x] `services/work-management-service/src/modules/risks/risks.service.ts` and risk tests -- split S6 read authorization from append authorization while preserving self denial, qualifying-line gate, FPA support, fail-closed behavior, append-only history, trend, and future-date rejection.
- [x] `services/bff/src/modules/employees/` or `services/bff/src/modules/profile-risks/` with tests -- expose `GET /api/v1/people/:subjectPersonId/risks` and `POST /api/v1/people/:subjectPersonId/risks`, exchange/forward a WMS audience token, forward `400`, normalize authorization failures to uniform `403`, and avoid accepting browser-supplied actor fields.
- [x] `services/people-service/src/modules/profile/` and profile tests, only if profile assembly or section metadata changes -- preserve Self/Colleague S6 omission and keep risk records out of People Service persistence. If no People Service changes are needed, document BFF profile-risks as the sole S6 data source.
- [x] `services/frontend/src/api/profile.ts`, profile hooks, and tests -- add risk history read and append clients, typed severities/trend/summary, mutation invalidation, cancellation, and `403` capability absence handling.
- [x] `services/frontend/src/pages/EmployeeProfilePage/` and i18n -- render S6 current summary, trend, retained history, empty/loading/generic error states, and an Add risk record form only when server-authorized and write-capable.
- [ ] `services/frontend/e2e/profile-risks.spec.ts` -- cover authorized read/append, read-without-write, self/colleague/forbidden omission, validation, success refresh, and dashboard drill-through landing on profile S6. Review gap: no dedicated profile-risks e2e file exists yet; current verification uses frontend build plus existing risk-dashboard/profile smoke.
- [x] `docs/access-control/section-matrix.md` -- record S6 profile read/append coverage and preserve Self/Colleague absence trace.

**Acceptance Criteria:**
- Given a viewer with S6 relationship access and `create-edit-risks`, when they open another person's Employee Profile, then they see S6 current risk, retained history, trend, and an Add risk record action.
- Given that viewer submits a valid risk record, when save succeeds, then WMS creates one append-only `RiskRecord`, the profile S6 section refreshes, and previous records remain visible.
- Given Self, Colleague, anonymous, no qualifying S6 relationship, or failed authorization dependency, when profile risk data is requested, then no S6 data or authoring affordance is returned or rendered.
- Given a viewer lacks `create-edit-risks` but can read S6, when they inspect the profile, then they can read authorized history and cannot append a new risk.
- Given `leaver` is saved or displayed, when the UI renders it, then it remains a risk prediction and does not affect employment status.

## Design Notes

Treat the profile risk section as a narrow S6 capability, not as a new generic profile authoring framework. BFF should proxy WMS directly for risk data instead of teaching People Service to persist or assemble risk history. If the frontend needs to know whether to show the Add action, prefer a server-derived capability in the risk response or a `403` append precondition over any client-side permission inference.

## Verification

**Commands:**
- `cd services/work-management-service && npm test` -- expected: risk history/append authorization and validation regressions pass.
- `cd services/bff && npm test` -- expected: profile risk proxy, upstream status, token audience, and validation tests pass.
- `cd services/people-service && npm test` -- expected when profile assembly or metadata changes: Self/Colleague S6 omission and no risk persistence regressions pass.
- `cd services/frontend && npm test && npx playwright test e2e/profile-risks.spec.ts` -- expected: S6 profile read/append, unauthorized omission, read-without-write, validation, and dashboard drill-through coverage pass.
