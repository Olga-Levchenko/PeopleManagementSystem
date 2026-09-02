---
title: 'Story 1-3: Organisational relationship changes as a dedicated journaled operation'
type: 'feature'
created: '2026-08-31'
status: 'in-progress'
review_loop_iteration: 0
baseline_commit: '3e82fee409f90d4d3dd12d96cf1ec57b2950b77f'
context:
  - 'C:/Users/Ihor/source/repos/PeopleManagementSystem/docs/requirements/project-requirements.md'
  - 'C:/Users/Ihor/source/repos/PeopleManagementSystem/docs/access-control/section-matrix.md'
  - 'C:/Users/Ihor/source/repos/PeopleManagementSystem/_bmad-output/planning-artifacts/architecture/architecture-PeopleManagementSystem-2026-08-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Manager, people-partner, department, and department-manager values are access
switches. Allowing them through ordinary S1 profile editing could silently grant or revoke
profile access without the dedicated permission, safeguards, or journal required by v1.5.

**Approach:** Add a dedicated, server-enforced relationship-change operation in People/Organization
with a separate screen/API boundary. Persist the relationship mutation, narrow journal entry, and
relationship-change event atomically where applicable, while consuming functional-role permission
decisions from Access Control rather than hardcoding role names.

## Boundaries & Constraints

**Always:** Only the stored `change organisational relationships` permission and the applicable
access policy may authorize a change. Cover exactly four relationship targets: a person's manager,
people partner, or department, and a department's manager. Reject self-assignment server-side.
Record actor, subject, before, after, and timestamp. The journal is narrow, not a general audit
log. Publish a versioned, provider-neutral relationship-change contract with event id, source
aggregate/version, occurred-at, schema version, and grant/revoke direction. Keep People/Organization
authoritative; Access Control owns only its derived projection.

**Ask First:** Confirm the concrete identity of the caller and authorization integration used by
the current foundation (request principal plus Access Control decision endpoint or adapter) if
implementation reveals that it has not been established. Confirm the event broker/outbox adapter
shape if no existing messaging foundation exists.

**Never:** Do not implement Story 1-1 role-resolution algorithms or Story 1-2 revocation/cache
behavior. Do not make relationship fields writable through general S1 updates, infer permission
from `HR Admin`, `UM`, `DM`, `PM`, or `PP` role names, or allow client-side-only enforcement.
Do not add full profile access, functional-role administration, timetracker behavior, or a general
audit log.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH | Authorized caller changes one supported relationship | Relationship changes; one journal entry records actor/subject/before/after/time; one compatible event is persisted for delivery | N/A |
| DENIED | Caller lacks stored relationship-change permission | No relationship, journal, or event mutation | Server returns authorization error |
| SELF_ASSIGNMENT | Target manager/PP/department-manager is caller, or caller assigns self to an unauthorized department | No mutation | Server returns validation/authorization error |
| GENERAL_PROFILE_WRITE | S1 update includes manager, PP, department, or department-manager | Access-switch fields are not changed | Server rejects request |
| MISSING_TARGET | Subject, department, or new related entity does not exist | No partial mutation | Server returns not-found/validation error |

</frozen-after-approval>

## Coordination Resolution

Story 1-1 and PR #14 are now merged. Story 1-1 provides a tested, DI-wired
`AccessRoleResolver` and a real RabbitMQ consumer for the internal
`ProjectAssignmentChangedEvent`, but it does not provide the HTTP or messaging contracts required
by this story:

- The permission-decision endpoint remains blocked by Story 1-4. The non-binding interim shape is
  `POST /api/v1/permissions/check` with `{ actorPersonId, permission }` and `{ granted }`.
- No organisational-relationship event consumer or projection-update endpoint exists in Access
  Control. The four People-owned relationships remain absent from its projection pipeline.
- Access Control has no observation endpoint for People-side freshness uncertainty, no
  organisational-relationship freshness state, and no reconciliation sweep for these changes.
- Authentication-principal integration remains blocked; Story 1-3 must not invent trusted headers or
  temporary authentication.

The merged Story 1-1 project-assignment event is an internal, project-specific contract and is not
wire-compatible with Story 1-3's shared `RelationshipChangedEvent`: it is flat, uses `IsGrant`, and
contains project/person/role fields rather than organisational relationship type plus
`beforeId`/`afterId`. Story 1-3 must not import, modify, or adapt that internal event in this branch.

Story 1-3 continues to use the versioned provider-neutral envelope in `libs/contracts`, one
People-owned `outbox_events` row per changed relationship field, and fail-closed unavailable
permission/projection adapters. No Access Control files may be changed on this branch.
RabbitMQ and the outbox remain the durable replay/recovery path. People-owned events exclude
`project_assignment`, which belongs to Timetracker/Epic 14.

The organisational-relationship consumer contract and consumer are owned by the Access Control
service as a follow-up to Story 1-1, mirroring its project-assignment consumer work. No numbered
follow-up story exists yet; it must be created and coordinated with Story 1-3's producer-side
contract before cross-service integration is attempted. Story 1-4 owns the separate
permission-decision endpoint.

The four relationship types have distinct subjects and meanings: `reports_to` means a person
reports directly to another person; `pp_assignment` means a person is assigned to a people partner;
`department_membership` means a person belongs to a department; `department_manager` means a
department is managed by a person. `department_management` is not a second relationship type.
People's relationship records are authoritative. A People-side freshness-uncertain marker records
that the post-commit projection update was not confirmed; it is not an authorization decision and
cannot make Access Control fail closed until the Access Control organisational-relationship
follow-up implements the consumer and observation mechanism.

## Code Map

- `services/people-service/src/app.module.ts` -- currently imports only health and Prisma; register
  the new organization/relationship feature here without placing business logic in the root module.
- `services/people-service/prisma/schema.prisma` -- empty domain schema; add authoritative people,
  departments, relationship history/current records, narrow journal, and outbox persistence here.
- `services/people-service/src/prisma/prisma.service.ts` -- existing Prisma connection boundary;
  all relationship, journal, and outbox writes must use the injected service and transactions.
- `libs/contracts/` -- contains the Story 1-3 provider-neutral relationship-change envelope; the
  final cross-language packaging and compatibility boundary still requires coordination.
- `services/access-control-service/` -- Story 1-1 is merged with resolver and project-assignment
  consumer infrastructure, but no permission-decision endpoint or organisational-relationship
  consumer exists. Story 1-3 must use ports and must not change Access Control files.
- `services/people-service/src/modules/health/` -- existing module and test are the local pattern
  for module registration and Jest setup.
- `services/people-service/CLAUDE.md` and `services/people-service/.claude/rules/` -- required
  NestJS, Prisma, test, and Node 22 conventions.
- `docs/requirements/project-requirements.md` plus `docs/requirements/Spec_Changelog_v1.2_to_v1.5.md`
  -- normative relationship targets, no-self-assignment rule, permission, and journal scope.
- `docs/decisions/ADR-001-authorization-projection-consistency.md` and architecture AD-3/AD-6/AD-9
  -- transactional outbox, versioning, idempotency, replay, and bounded-context ownership.

### Merged Story 1.1 boundary and no-change rule

PR #14 is merged into `main`, together with the subsequent Story 1.1 resolver and
project-assignment consumer work. The Access Control implementation is now accepted as the
reference for its own project-assignment pipeline, but it does not implement Story 1.3's
organisational-relationship consumer or permission endpoint.

- **Domain/projection files present in the diff:** `services/access-control-service/src/AccessControlService.Domain/AccessRole.cs`,
  `services/access-control-service/src/AccessControlService.Domain/IRelationshipRepository.cs`,
  `services/access-control-service/src/AccessControlService.Infrastructure/Persistence/Person.cs`,
  `services/access-control-service/src/AccessControlService.Infrastructure/Persistence/Department.cs`,
  `services/access-control-service/src/AccessControlService.Infrastructure/Persistence/ProjectAssignment.cs`,
  `services/access-control-service/src/AccessControlService.Infrastructure/Persistence/ProjectAssignmentEventWatermark.cs`,
  `services/access-control-service/src/AccessControlService.Infrastructure/Persistence/ProjectAssignmentRole.cs`,
  `services/access-control-service/src/AccessControlService.Infrastructure/Persistence/AccessControlDbContext.cs`,
  and `services/access-control-service/src/AccessControlService.Infrastructure/Persistence/EfRelationshipRepository.cs`.
  These are Access Control-side infrastructure/projection candidates, not People-owned models and
  not Story 1-3 dependencies.
- **Event model present in the diff:** `services/access-control-service/src/AccessControlService.Infrastructure/Messaging/ProjectAssignmentChangedEvent.cs`.
  It is a project-assignment-specific internal model, not the shared four-relationship contract
  proposed here. Do not import or duplicate it in People.
- **Event processor present in the diff:** `services/access-control-service/src/AccessControlService.Infrastructure/Messaging/ProjectAssignmentEventProcessor.cs`.
  It is consumer-side processing logic, not a People outbox or relationship journal.
- **Migrations present in the diff:** `services/access-control-service/src/AccessControlService.Infrastructure/Persistence/Migrations/20260830184609_InitialCreate.cs`,
  `20260830190557_AddProjectAssignments.cs`, `20260830195213_AddProjectZephyrFixture.cs`,
  `20260831094004_AddProjectAssignmentEventWatermarks.cs`, plus their designer files and
  `AccessControlDbContextModelSnapshot.cs`. They do not migrate `services/people-service`.
- **APIs, permissions, outbox, and journal:** Access Control has no Story 1-3 relationship API,
  caller-principal integration, functional-permission store, permission decision endpoint,
  organisational-relationship consumer, People transactional outbox, or narrow relationship
  journal. The People-side API/outbox/journal are owned by Story 1.3.
- **Tests:** the PR includes Access Control health, resolver, persistence, and event-processor
  tests, but no Story 1-3 authorization, dedicated API, self-assignment, People transaction,
  journal, or outbox tests.

Therefore Story 1-3 may depend on the merged Access Control implementation's architectural and
messaging conventions, but must not import or modify its fixture models, internal event model,
event processor, or any other Access Control file. The organisational-relationship consumer
contract and consumer remain a separate Access Control follow-up to Story 1.1, coordinated with
Story 1.3's producer-side contract. People feature files remain separate.

### Proposed shared relationship event contract

The confirmed canonical contract is versioned under `libs/contracts`, with the People service as
authoritative producer and Access Control as a consumer:

```json
{
  "eventId": "uuid",
  "schemaVersion": 1,
  "occurredAtUtc": "2026-08-31T12:00:00Z",
  "source": {
    "service": "people-service",
    "aggregateType": "person|department",
    "aggregateId": "uuid",
    "aggregateVersion": 1
  },
  "relationship": {
    "type": "reports_to|pp_assignment|department_membership|department_manager",
    "subjectId": "uuid",
    "beforeId": "uuid|null",
    "afterId": "uuid|null"
  },
  "accessEffect": "grant|revoke|both|none"
}
```

The contract deliberately has no provider-specific fields. `beforeId` and `afterId` make a
replacement auditable and allow the consumer to derive both revocation and grant; `accessEffect`
is an explicit routing hint and must not replace authoritative relationship state. The PR #14
`ProjectAssignmentChangedEvent` remains projection-internal and is excluded from People-owned
events.

### Coordination decisions required with Story 1-1

| Decision | Proposed option | Alternatives | Recommendation | Story 1-1 approval? |
|---|---|---|---|---|
| Contract ownership | Versioned package under `libs/contracts`, People produces, Access Control consumes | Contract local to Access Control; duplicate DTOs | Use `libs/contracts` as the single canonical seam | Yes |
| Event shape | One envelope with four relationship types and typed `beforeId`/`afterId` | Separate event names; one event per grant/revoke | One envelope, unless consumer routing requires separate names | Yes |
| Replacement semantics | One event contains before/after and `accessEffect: both` | Emit separate revoke and grant events; consumer derives effect | Keep one atomic change event and derive detailed effects from before/after | Yes |
| Version ordering | Monotonic `aggregateVersion` per person/department aggregate | Global sequence; timestamp ordering | Per-aggregate version, with duplicate/out-of-order rejection | Yes |
| Permission lookup | People API calls an Access Control permission-decision boundary | Shared library; temporary local adapter | Access Control decision boundary; no role-name checks | Yes |
| Publication unit | One outbox event per relationship field mutation, committed with the mutation | One event per broader transaction | One event per changed relationship field for precise journal/event correlation | Yes |
| Consumer source of truth | Access Control consumes People-owned events and projects them locally | Continue using PR #14 fixture tables as authority | Treat PR #14 tables as temporary fixtures only; People remains authoritative | Yes |

The contract and ownership decisions above are resolved. Any later change to them requires
coordination with the Story 1-1 developer.

## Tasks & Acceptance

**Execution:**
- [x] `libs/contracts/` -- create the confirmed versioned provider-neutral relationship-change
  contract and compatibility tests -- give all producers and consumers one event shape without
  overwriting PR #14's projection-internal type.
- [x] `services/people-service/prisma/schema.prisma` and generated migration -- model supported
  relationships, the six-event narrow journal shape, and `outbox_events` state including delivery
  and retry metadata -- preserve authoritative ownership and atomicity.
- [x] `services/people-service/src/modules/organisational-relationships/` -- add DTOs, controller,
  service, synchronous permission/projection client ports, journal mapping, event enqueueing, and
  People-side freshness-uncertain recording -- keep the API dedicated and controllers thin. Do
  not implement or claim the real Access Control update or fail-closed authorization here. Expose
  dedicated `PATCH` endpoints for `people/:personId/manager`, `people/:personId/people-partner`,
  `people/:personId/department`, and `departments/:departmentId/manager` under the versioned
  relationship resource; enforce the permission and self-assignment rules server-side.
- [x] `services/frontend/src/pages/OrganisationalRelationshipsPage/` and
  `services/frontend/src/api/` -- add an i18n-backed relationship-management screen and API client
  calls for all four dedicated endpoints -- use the BFF boundary and show authorization,
  validation, missing-target, and safe-failure responses without treating disabled UI as security.
- [x] `services/people-service/src/modules/outbox/` -- add the background RabbitMQ publisher for
  pending outbox rows, with retry metadata and failed-state handling -- preserve durable replay and
  recovery without making delivery timing the next-request guarantee.
- [x] `services/people-service/src/app.module.ts` -- register the feature module -- expose the
  dedicated operation without changing unrelated modules.
- [x] `services/people-service/src/modules/organisational-relationships/__tests__/` and
  `services/people-service/test/` -- test authorization denial, all four targets, self-assignment,
  general S1 rejection, atomic journal/event behavior, and missing targets.

**Acceptance Criteria:**
- Given a caller without the stored relationship-change permission, when they submit any supported
  relationship change through either general S1 or the dedicated endpoint, then the server rejects
  it and persists no relationship, journal, or event.
- Given an authorized caller, when they change a manager, people partner, department, or
  department manager through the dedicated operation, then the new relationship and exactly one
  journal entry are persisted with actor, subject, before, after, and timestamp.
- Given any caller, when they attempt a prohibited self-assignment, then the server rejects it
  without changing data.
- Given an actor assigning a manager or People Partner, when the target person is the actor, then
  the server rejects the assignment. Given an actor assigning a department, when the actor does
  not manage that department, then the server rejects the assignment. Given a department-manager
  change, when the actor would become that department's manager and is not already entitled to
  manage it, then the server rejects it; an already-authorized existing assignment is an
  idempotent/no-op case, not a new self-assignment grant.
- Given an authorized user on the relationship-management screen, when they submit any of the four
  relationship forms, then the frontend calls only its dedicated endpoint and renders the server
  success or error state.
- Given a relationship mutation transaction, when persistence or event enqueueing fails, then the
  relationship and its journal/outbox side effects do not commit partially.
- Given a committed platform-owned relationship mutation, when the synchronous Access Control
  adapter reports failure, then the endpoint returns a safe failure and records People-side
  freshness-uncertain state; real fail-closed authorization remains blocked until the Access Control
  organisational-relationship follow-up exposes an observation mechanism.
- Given a relationship field change, when its outbox event is created, then it uses the shared
  envelope, is one event for that changed field, and never uses `project_assignment` as a
  People-owned aggregate type.
- Given Story 1-1 consumes a relationship-change event, when it reads the shared contract, then it
  can distinguish source/version, occurrence, and grant/revoke direction without a Story 1-3-only
  DTO or raw provider payload.

## Design Notes

The six journal event categories are manager change, people-partner change, department change,
department-manager change, full-profile-access grant/revocation, and shared-link access. This
story implements only the first four; the journal model must remain extensible enough for Stories
1-5 and 6-2 without turning into an unrestricted audit log.

## Verification

**Commands:**
- `npm ci` and `npm run build` (from `libs/contracts`) -- passed in a focused clean copy with no
  pre-existing `dist/`.
- `npm run build` (from `services/people-service`) -- expected: successful NestJS/TypeScript build.
- `npm run lint` (from `services/people-service`) -- expected: no ESLint errors.
- `npm test` (from `services/people-service`) -- expected: unit tests pass.
- `npm run test:e2e` (from `services/people-service`, with Postgres) -- expected: relationship
  endpoint and transaction/error cases pass.
- `npm run build` (from `services/frontend`) -- expected: successful type-check and production
  bundle.
- `npm run lint` (from `services/frontend`) -- expected: no ESLint errors.
- `npm run test` (from `services/frontend`) -- expected: API authorization/error and screen flow
  tests pass.

**Verification results (2026-09-01):** Contracts typecheck, build, and 5 compatibility tests passed.
People Service typecheck, build, and 43 unit tests passed; PostgreSQL outbox integration passed
5 tests. BFF typecheck, build, and 8 tests passed. Frontend typecheck, build, ESLint, and 5
Playwright tests passed. Four unrelated pre-existing lint errors remain outside Story 1.3.
Focused clean verification also passed: `npm ci` and `npm run build` in `libs/contracts`, followed
by `npm ci` and `npm run build` in `services/people-service`, with `libs/contracts/dist` absent
before installation.

**Verification boundary:** People-side API, frontend, persistence, contract serialization, and
adapter failure tests can complete in this story. The real Access Control permission endpoint,
organisational-relationship consumer, post-commit projection update, freshness observation,
reconciliation, and fail-closed authorization integration remain blocked until Story 1-4 and the
Access Control organisational-relationship follow-up expose their contracts; test adapters must
make that limitation explicit rather than claiming end-to-end completion.

**Current implementation state:** The People-side schema/migration, dedicated API boundary,
frontend screen, module registration, shared-contract compatibility coverage, focused unit tests,
PostgreSQL outbox integration coverage, and RabbitMQ publisher are implemented and PR-ready.
The real Access Control permission/projection integrations, freshness observation, reconciliation,
and authentication principal integration remain incomplete or blocked. Product completion awaits
those external integrations, so Story 1-3 must remain `in-progress`.

## Blocked Integration Items

Story 1-3 remains `in-progress` and must not be marked done while these external integration
dependencies are unavailable:

- Story 1-4's real synchronous Access Control permission-decision API.
- The Access Control follow-up's organisational-relationship event consumer and post-commit
  projection update.
- Access Control observation of People-side freshness uncertainty.
- Reconciliation and fail-closed authorization behavior based on that uncertainty.
- Authentication middleware/principal integration for `request.user.sub`.

People-side ports, fail-closed unavailable adapters, persistence, API/UI behavior, and adapter tests
may be completed independently. These adapters are test seams, not proof of cross-service
integration. No Access Control files should be changed in the Story 1-3 branch.

## Review Findings

### Fixed

- Previous H1 acceptance-coverage gap: focused People-service tests now cover all four relationship
  targets, journal/outbox contents, before/after values, aggregate versions, self-assignment,
  missing targets, idempotent no-op, transaction failure propagation, and projection freshness
  failure.
- Previous H2 BFF gap: all four dedicated PATCH proxy routes now exist and preserve the original
  Authorization header, upstream status, and safe response body without actor-ID headers.
- Previous outbox aggregate-type, aggregate-version uniqueness, route UUID validation, and
  permission-denial status findings are fixed.
- The transactional outbox publisher now claims with `FOR UPDATE SKIP LOCKED`, reclaims stale
  processing rows, retries with backoff, and transitions terminal failures to `FAILED`.
- Prisma schema and migration validate consistently; production source type-checks for both
  People service and BFF.

### Locally fixable

- [x] [Review][Patch] Department membership clearing now rejects omitted/empty input, accepts
  explicit `null`, persists the normalized value, and sends `null` from the frontend clear action.
  [services/people-service/src/modules/organisational-relationships/dto/change-department.dto.ts; services/people-service/src/modules/organisational-relationships/organisational-relationships.service.ts; services/frontend/src/api/organisationalRelationships.ts]
- [x] [Review][Patch] Shared contract packaging and compatibility coverage are resolved with the
  `@pms/contracts` package, exports, JSON Schema, fixtures, and compatibility tests.
  [libs/contracts/package.json; libs/contracts/src/index.ts; libs/contracts/test/relationship-events.test.ts]
- [x] [Review][Patch] Outbox concurrency and retry behavior are covered by a PostgreSQL
  integration test exercising concurrent claims, stale-lock recovery, next-attempt filtering,
  retry-limit transition, and ownership-safe status updates.
  [services/people-service/src/modules/outbox/__tests__/outbox-publisher.integration.spec.ts]
- [x] [Review][Patch] Full test-source TypeScript checks now pass after correcting the Prisma
  transaction callback helper and overloaded fetch spy typings. [services/people-service/src/modules/organisational-relationships/__tests__/organisational-relationships.service.spec.ts; services/bff/src/modules/organisational-relationships/__tests__/organisational-relationships.service.spec.ts]
- [x] [Review][Patch] Frontend relationship submissions now cover all four dedicated endpoint
  paths and render safe, differentiated validation, permission, missing-target, unavailable,
  and unknown failure messages without exposing upstream details.
  [services/frontend/src/pages/OrganisationalRelationshipsPage/OrganisationalRelationshipsPage.tsx; services/frontend/e2e/app.spec.ts]
- [x] [Review][Patch] Outbox startup and interval publication now have an explicit scheduler
  error boundary that logs rejected publication runs and remains available for later runs.
  [services/people-service/src/modules/outbox/outbox-publisher.service.ts; services/people-service/src/modules/outbox/__tests__/outbox-publisher.service.spec.ts]

### Blocked by Story 1-4, Access Control follow-up, and authentication

- [x] [Review][Defer] ~~Verified principal/authentication middleware is not present, so
  `RequestActorContext` cannot obtain `request.user.sub`; this must remain blocked rather than
  introducing trusted headers or temporary authentication.~~ **RESOLVED (Story 1.11, 2026-09-02):**
  `people-service` now runs a global Passport JWT guard (`src/modules/auth/`, PR #26) validating
  bearer tokens against a real Keycloak realm (`authentication-service`, PR #24) — the same token
  the BFF already validates at the edge (PR #25). `request.user.sub` is genuinely populated;
  `RequestActorContext.actorId` no longer unconditionally throws. Only the second blocker below
  (Story 1.4's permission-decision adapter) still keeps this story from `done`.
  [services/people-service/src/modules/organisational-relationships/request-actor.context.ts:13-20]
- [x] [Review][Defer] The real Story 1-4 permission-decision adapter, Access Control
  organisational-relationship consumer/post-commit projection endpoint, freshness observation,
  reconciliation, and fail-closed cross-service integration are unavailable. The current adapters
  correctly fail closed and must not be treated as end-to-end authorization evidence.
  [services/people-service/src/modules/organisational-relationships/organisational-relationships.ports.ts:13-20]

### Out of scope

- [x] [Review][Defer] General S1 profile-write rejection is not implemented because no S1 update
  endpoint exists in this story; enforce it when the general profile-edit story lands.
- [x] [Review][Defer] Project-assignment relationship events, functional-role administration,
  full-profile-access grants, shared-link access, and reconciliation behavior belong to other
  stories or integrations.
