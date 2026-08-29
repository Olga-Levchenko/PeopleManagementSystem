# Internal timetracker integration

Status: **confirmed contract findings recorded; operational details remain pending**.
Findings are based on the supplied `TimeTracker External API` OpenAPI contract, version `1.0.0`,
recorded in-repo at `docs/integrations/contracts/timetracker-openapi-v1.0.0.json`.

## Contract provenance

- **Contract name:** TimeTracker External API
- **API version:** 1.0.0
- **Date recorded:** 2026-08-28
- **SHA-256:** `F1B3135EC3E23C253E4FB1ABF7291F34B0A8C6D6CC063C13AA56A78D56EAD053`
- **Note:** the file contains schema and auth-policy definitions only (`X-Api-Key` header name and
  partner policy names); it contains no API-key values, credentials, tokens, or personal data.

Source requirement: `docs/requirements/project-requirements.md` Section 5.1, as amended by the
v1.5 changelog. **The timetracker is now the only required integration** (PeopleForce is
good-to-have as of v1.5 — see the sibling doc). Two APIs are provided by the timetracker
architect: **Leaves** and **Projects and people**. The second one is load-bearing beyond display —
project assignment (who's on which project, and its PM/DM) is a direct input to access-role
resolution (Section 2.1), not just something shown on a profile. As of v1.5, Manager access
resolution has a *third* feeding relation besides reports-to and project assignment — **department
management** — which is first-party/platform data, not something this integration needs to supply.

## Owner

Not yet assigned. Whoever owns this should fill in name + date here once claimed.

## What to investigate and record here

### Leaves API
- The supplied contract does not expose a dedicated leaves endpoint.
- Leave-related data is available through `POST /api/accounting/report`, which returns an
  `AccountingReportResponse` containing a date range, employees, lookup tables, and per-day
  status data.
- Request body: required `month` and `year`; optional arrays `reportStates`, `employeeIds`,
  `dayStatuses`, and `dayApprovalStates`.
- Employee records contain `id`, `email`, `name`, `hash`, `countryCode`, optional `totalHours`,
  and `days`. Each day contains `date`, optional `companyId`, `projectId`, project identifiers,
  hour totals, overtime fields, `dayStatus`, and optional report/approval states.
- The endpoint requires the Accounting API-key policy described below.
- The contract does not document pagination for this response; pagination remains pending
  confirmation.
- Leave types supported and how they map to the platform's leave-type display (S10).
- Accounting employee records expose `Employee.id` and `email`. `Employee.id` is persisted as the
  opaque provider-scoped external identifier, without assuming immutability or non-reuse.
- Update model: push (webhook) vs. pull (poll on a schedule) — affects how fresh S10 data is.

### Projects and people API
- `GET /api/projects/talents` retrieves project state and team-member state. It optionally accepts
  repeated `statuses` query parameters, for example `?statuses=1&statuses=2`.
- The response contains `projects`, plus project-status and project-type lookup lists.
- Each `ProjectTalentDto` contains:
  - `id: integer`
  - `name: string`
  - `description: string`
  - `startDate: date-time`
  - nullable `endDate: date-time`
  - `status: ProjectStatus`
  - `type: ProjectType`
  - `projectManager: string`
  - `deliveryManager: string`
  - `members: AccountTalentDto[]`
  - nullable `isBillable: boolean`
- Each `AccountTalentDto` contains required `email: string` and `dateStart: date-time`, plus
  nullable `dateEnd: date-time`.
- The supplied contract models one required `projectManager` string and one required
  `deliveryManager` string per project. Their identity format and semantic multiplicity remain
  pending confirmation.
- This directly feeds the Manager access role's "is assigned to a project managed by" relation
  (2.1). The permission model depends on assignment start/end being knowable (2.1: "when a
  project assignment ends, the derived access ends with it").
- `ProjectTalentDto.id` identifies a project in the supplied contract. `AccountTalentDto` exposes
  members only by email and provides no employee ID. Member email must therefore be reconciled
  through the explicitly verified `Employee.id`-to-`person_id` mapping described below.
- **State retrieval confirmed:** the supplied OpenAPI contract exposes state retrieval and documents
  no event or webhook interface. This does not rule out undocumented provider capabilities. The
  platform may derive internal normalized relationship-change events by diffing retrieved state;
  those would not be provider-emitted events.
- Update model: push vs. pull, and how quickly a new assignment or an ended one propagates to
  access resolution. Section 6 warns that a stale permission cache is a data leak — the sync
  latency here is a real access-control parameter, not just a data-freshness one. **The latency
  bound itself is no longer open** (v1.5, §2.1/§5.1): project-derived access must change within
  **15 minutes** of the underlying assignment change under normal sync; if sync itself is failing,
  project-derived access must be forcibly withdrawn within **4 hours** regardless (serve
  last-known leave/project data behind a visible "unable to refresh" banner in the meantime — never
  silently keep stale access active past that bound). Platform-owned relationship edits (reporting
  line, department, PP assignment) are not this integration's concern — those take effect on the
  very next request since they're first-party data with no external-sync excuse.

### Authentication
- Every endpoint in the supplied contract uses a per-partner API key in the `X-Api-Key` header.
  No cookie or JWT session is involved.
- `POST /api/accounting/report` uses the `AccountingApiKey` policy. Missing/invalid keys return
  `401`; a key not authorized for Accounting returns `403`.
- `GET /api/projects/talents` uses the `TalentsApiKey` policy. Missing/invalid keys return `401`;
  a key not authorized for Talents returns `403`.
- Accounting and Talents keys are separate server-side secrets. They must be supplied through the
  deployment/runtime secret mechanism selected for the environment and must never be committed to
  the repository, exposed to the frontend, or logged.

### Identity resolution
Per Section 6: "A person exists as a PeopleForce candidate, then as an employee here, and
separately as a timetracker user... email alone is not sufficient." Record the decision on how
this platform's employee id maps to a timetracker user id.

- Persist `Employee.id` as an opaque, provider-scoped external identifier.
- Use a project member's `AccountTalentDto.email` only to locate a potential mapping between
  Timetracker `Employee.id` and internal `person_id`. Email alone never verifies or activates the
  mapping.
- Project-derived access is granted only after the mapping between `Employee.id` and internal
  `person_id` has been explicitly verified.
- Missing, ambiguous, stale, or otherwise unverified mappings fail closed: the member does not
  receive project-derived access.
- `Employee.hash` is not used for identity reconciliation.
- The supplied contract does not establish that `Employee.id` is immutable or non-reusable; those
  properties remain unassumed.

### Failure handling
Section 7 requires external integration failures to degrade gracefully and never take the
application down. **v1.5 settles the outage behavior explicitly:** serve last-known S10/S11 data
behind a visible "unable to refresh" banner, and forcibly withdraw project-derived access after 4
hours of failed sync regardless of what the last-known state said (fail closed past that bound —
never leave ended or stale access active). What's still to record here: the exact mechanism for
detecting "sync has been failing for 4 hours" (a scheduler job? a staleness timestamp checked at
request time?) and whether S10/S11 display itself degrades sooner than the 4-hour access-withdrawal
bound (the changelog only mandates the banner, not a specific display-side timeout).

### Rate limits
No rate limits are documented in the supplied contract. Rate limits and their implications for
polling remain pending confirmation.

## Decision log

### 2026-08-28 — Timetracker contract and identity handling
- **Decision:** The supplied OpenAPI contract exposes state retrieval and documents no event or
  webhook interface. Use separate server-side Accounting and Talents API keys in the `X-Api-Key`
  header. Persist `Employee.id` as an opaque provider-scoped identifier; use project-member email
  only to locate a mapping, require explicit verification before activating it, and fail closed
  for unresolved mappings.
- **Why:** The contract documents two partner-specific API-key policies and no event/webhook
  interface. Email is a locator, not sufficient identity proof, and project-derived access must
  not be granted on ambiguous or unverified identity data.

<!-- As decisions are made, append entries here in the ADR-lite style used in docs/decisions/:
     what was decided, why, and date. Cross-link to a full ADR in docs/decisions/ if the decision
     is significant enough to warrant one on its own (e.g. the identity-resolution strategy). -->

## Open questions

- Polling cadence.
- Rate limits.
- Response completeness and whether all required employees/projects are returned.
- Pagination behavior, including whether an undocumented server-side limit exists.
- Delay between a source change and its visibility through the API.
- Semantic format and identity meaning of `projectManager` and `deliveryManager`.
- Whether `Employee.id` is stable and non-reused.
- Meaning, stability, uniqueness, and intended use of `Employee.hash`.
- Whether absence from a response means assignment removal.
- Exact mechanism for detecting a 4-hour sync-failure window for the forced access-withdrawal bound.

## Population

Per v1.5: the employee population is a seeded list, generated and imported into the timetracker
test environment, **delivered 2026-08-26**. Import it — that is who the platform is built and
tested against; do not import real employee data beyond this seeded list
(`.claude/rules/pseudonymized-data-only.md`). No SSO/Active Directory and no employee-creation flow
this iteration — authentication is a first-party implementation over this seeded population.

## Related

- `docs/integrations/contracts/timetracker-openapi-v1.0.0.json` — in-repo OpenAPI contract
  (v1.0.0) this document's findings are traced to
- `docs/requirements/project-requirements.md` Sections 2.1, 5.1, 6, 7
- `docs/requirements/Spec_Changelog_v1.2_to_v1.5.md` — source of the revocation-timing and
  outage-behavior decisions recorded above
- `.claude/rules/access-control-invariants.md` — cache-invalidation invariant this integration
  must satisfy
- `docs/integrations/peopleforce.md` — the sibling integration doc
