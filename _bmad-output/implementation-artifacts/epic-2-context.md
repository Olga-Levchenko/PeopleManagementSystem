# Epic 2 Context: All Employees List & Self-Service

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Managers and people partners browse, filter, configure columns, edit inline, save views, and export the employee roster within their access entitlements. Employees manage their own personal/emergency data and read their own managed fields. Epic 2 builds on Epic 1 profile and access-control foundations.

## Stories

- Story 2.1: Universal filter/column engine over profile fields — **done**
- Story 2.2: Inline editing writes through to the profile, subject to access
- Story 2.3: Saved views
- Story 2.4: Export respects the exporter's access
- Story 2.5: Colleague mode on All Employees
- Story 2.6: Self-managed personal data
- Story 2.7: Self-read of managed data and never own risk level

## Requirements & Constraints

- Any profile field may be a filter and column when the viewer's entitlements allow it; custom fields appear without deploy when HR Admin defines them.
- Inline edits on All Employees write through to the underlying profile field and must be enforced server-side against the section access matrix — UI disable alone is insufficient.
- Manager, people partner, and department fields never change via inline edit; they use dedicated organisational-relationship operations (Story 1.3).
- Server-side pagination for list endpoints (ADR-004 Decision 3). List responses must not leak fields the viewer cannot see.
- Colleague mode (Story 2.5) is a whitelist surface — not equivalent to manager/PP list mode.
- Access roles are derived per subject per request; never cache a single global role for the session.

## Technical Decisions

- Story 2.1 established `people-service` employees module with field catalog + paginated list, single `resolveBatch` per page, BFF proxy, and frontend `/all-employees`.
- Shared `profile-audience.util.ts` derives per-subject section levels from `AccessRoleResolution`.
- Custom-field visibility uses `canSeeCustomField()` (Story 1.10); catalog/list must respect visibility for filters, columns, and values.
- Profile read today is `GET /people/:subjectPersonId/profile` only — no general profile write endpoint exists yet.

## UX & Interaction Patterns

- Inline editing: cell commits on blur/confirm; success/failure announced via `aria-live` region.
- Editable cells use dashed border affordance (see `key-all-employees.html`); non-editable cells are read-only.
- Filter builder, saved views, export, and colleague mode are separate stories — do not ship them in 2.2.

## Cross-Story Dependencies

- **2.2** depends on **2.1** (list surface, catalog, row values).
- **2.3–2.5** extend the same All Employees component — sequential delivery recommended to avoid merge conflicts.
- **2.6–2.7** are self-service on the profile page and can parallelize with 2.3+ once 2.2 lands the shared write path.
