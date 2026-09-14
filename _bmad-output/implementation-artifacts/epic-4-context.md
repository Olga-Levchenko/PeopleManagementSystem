# Epic 4 Context: Risks & Risk Dashboard

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Managers and people partners record and track employee risk levels with correct severity and `leaver` prediction semantics; a dedicated dashboard surfaces who needs attention. Epic 4 establishes the `RiskRecord` append-only history in `work-management-service` (Story 4.1), then the Risk Dashboard API/UI (Story 4.2), then the Employee Profile S6 risk-history and authoring surface (Story 4.3).

## Stories

- Story 4.1: Risk record with retained history
- Story 4.2: Risk dashboard
- Story 4.3: Profile S6 risk history and authoring UI

## Requirements & Constraints

- Risks live in `work-management-service` per architecture AD-1 (not people-service).
- S6 matrix: Self **—** (never read own risk — Story 2.7); Reporting line **RW**; Project line **RW**; PP **RW**; Full profile access **RW** (via `fullProfileAccessLine`, Story 1.5).
- Functional permission `create-edit-risks` (Story 1.4 catalogue) gates every route; access role gates which subjects.
- Severity order (fixed): `low` < `need_attention` < `medium` < `high` < `leaver`. No resolved/closed state — transitions any direction allowed.
- `leaver` is a **prediction**, never employment status (Epic 16).
- Current level = most recent record by `recordedAt` (then `createdAt` desc on tie); full history retained append-only.
- `recordedAt` must be today or in the past (UTC); future dates rejected with `400`.
- Trend arrow: up/down only when level differs from immediately preceding record in chronological order; none on first record or unchanged level. Compute on asc-ordered history; API returns records `recordedAt` desc.
- Active risk counts exclude `low` (dashboard semantics — Story 4.2 UI; Story 4.1 exposes `isActive` on current summary).
- Profile S6 assembly in `people-service`, BFF proxy, and dashboard page are **not** Story 4.1.
- Profile S6 risk history and append UI are **not** Story 4.2; Story 4.2 remains read-only dashboard/listing and drills through to the profile.

## Technical Decisions

- Reuse WMS patterns from Epic 3: `RequestActorContext` (O4-142 platform `Person.id`), JWT auth, service-token exchange, `AccessRoleResolutionPort`, permissions-check port.
- **Gate order (every route):** resolve actor → self-subject `403` **before** ACS resolve → permission check → relationship resolve → handler.
- Relationship gate for S6 write/read toward **other** subjects: `reportingLine || peoplePartnerLine || projectLine || fullProfileAccessLine`.
- **Self-subject is always denied** (`403`) on POST and GET — unlike action-items self-assign; S6 Self cell is `—` (even when `fullProfileAccessLine` is true).
- All authorization denials return uniform `403` (no body differentiation). ACS unreachable → fail-closed `403`.
- Append-only `RiskRecord` rows — no PATCH/DELETE in Story 4.1.

## UX & Interaction Patterns

- `SeverityBadge` + trend arrow are reused on the Risk Dashboard and profile S6 section. Story 4.1 delivers API fields (`trendDirection`, `summary.isActive`); Story 4.2 surfaces current-risk list semantics; Story 4.3 surfaces per-person history and append affordances on Employee Profile.

## Cross-Story Dependencies

- **Requires:** Epic 3 done (WMS identity + ACS clients); Story 1.4 (`create-edit-risks`); Story 1.5 (`fullProfileAccessLine`); Story 2.7 (self must never read S6); Story O4-142 (platform `Person.id` in WMS).
- **Blocks:** Story 4.2 (dashboard), Story 4.3 (profile S6 risk history/authoring), Epic 5 dashboard risk counters, people-service S6 profile assembly.
