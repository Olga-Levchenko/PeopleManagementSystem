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

The Story 1-1 developer confirmed the contract direction. Use the versioned shared relationship-
event envelope in `libs/contracts`, the synchronous Access Control permission-decision API, and one
People-owned `outbox_events` table. Persist each relationship mutation, its narrow journal entry,
and one outbox event per changed relationship field atomically. Story 1-3 defines only People-side
client ports/contracts and adapter tests for the post-commit projection update; the real Access
Control endpoint and fail-closed authorization remain blocked until Story 1-1 exposes them.
RabbitMQ and the outbox remain the durable replay/recovery path. People-owned events exclude
`project_assignment`, which belongs to Timetracker/Epic 14.

The four relationship types have distinct subjects and meanings: `reports_to` means a person
reports directly to another person; `pp_assignment` means a person is assigned to a people partner;
`department_membership` means a person belongs to a department; `department_manager` means a
department is managed by a person. `department_management` is not a second relationship type.
People's relationship records are authoritative. A People-side freshness-uncertain marker records
that the post-commit projection update was not confirmed; it is not an authorization decision and
cannot make Access Control fail closed until Story 1-1 implements an observation endpoint/consumer.

## Code Map

- `services/people-service/src/app.module.ts` -- currently imports only health and Prisma; register
  the new organization/relationship feature here without placing business logic in the root module.
- `services/people-service/prisma/schema.prisma` -- empty domain schema; add authoritative people,
  departments, relationship history/current records, narrow journal, and outbox persistence here.
- `services/people-service/src/prisma/prisma.service.ts` -- existing Prisma connection boundary;
  all relationship, journal, and outbox writes must use the injected service and transactions.
- `libs/contracts/` -- absent today despite AD-9 requiring shared versioned contracts; create the
  provider-neutral relationship-change message contract here as the shared seam for Story 1-1's
  consumer and the future Timetracker adapter. Story 1-1 must consume this contract, not redefine it.
- `services/access-control-service/` -- currently contains only `.gitkeep`; Story 1-1 owns its
  resolution implementation. Story 1-3 must call a permission decision boundary or use the agreed
  contract, never duplicate resolution or role-name checks.
- `services/people-service/src/modules/health/` -- existing module and test are the local pattern
  for module registration and Jest setup.
- `services/people-service/CLAUDE.md` and `services/people-service/.claude/rules/` -- required
  NestJS, Prisma, test, and Node 22 conventions.
- `docs/requirements/project-requirements.md` plus `docs/requirements/Spec_Changelog_v1.2_to_v1.5.md`
  -- normative relationship targets, no-self-assignment rule, permission, and journal scope.
- `docs/decisions/ADR-001-authorization-projection-consistency.md` and architecture AD-3/AD-6/AD-9
  -- transactional outbox, versioning, idempotency, replay, and bounded-context ownership.

### PR #14 assessment and concurrent Story 1-1 conflict assessment

PR #14 (`Scaffold access-control-service (Story 1.1, part 1)`, open, head
`18635cea33593c0bf5b8bbf15cd0cc2995a4568f`) is treated here as infrastructure only, consistent
with its summary. Its diff does contain files named like domain/projection components; their
presence is recorded below, but Story 1-3 must not assume their behavior is accepted, stable, or
reusable.

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
- **APIs, permissions, outbox, and journal:** no Story 1-3 relationship API, caller-principal
  integration, functional-permission store, permission decision endpoint, People transactional
  outbox, or narrow relationship journal is evidenced by the PR diff.
- **Tests:** the PR includes Access Control health, resolver, persistence, and event-processor
  tests, but no Story 1-3 authorization, dedicated API, self-assignment, People transaction,
  journal, or outbox tests.

Therefore Story 1-3 should depend on PR #14 only for the service scaffold and repository
infrastructure conventions. It should avoid all listed domain/projection classes, fixture data,
internal event model, and event processor until the Story 1-1 developer explicitly confirms an
integration boundary. No PR #14 file should be changed by Story 1-3. Shared-file overlap remains
`infra/postgres-init/01-create-databases.sh`, `.gitignore`, `.gitattributes`, and implementation
artifact status files; People feature files remain separate.

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
- [ ] `libs/contracts/` -- create the confirmed versioned provider-neutral relationship-change
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
- [ ] `services/people-service/src/modules/outbox/` -- add the background RabbitMQ publisher for
  pending outbox rows, with retry metadata and failed-state handling -- preserve durable replay and
  recovery without making delivery timing the next-request guarantee.
- [x] `services/people-service/src/app.module.ts` -- register the feature module -- expose the
  dedicated operation without changing unrelated modules.
- [ ] `services/people-service/src/modules/organisational-relationships/__tests__/` and
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
  freshness-uncertain state; real fail-closed authorization remains blocked until Story 1-1 exposes
  an observation mechanism.
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

**Verification boundary:** People-side API, frontend, persistence, contract serialization, and
adapter failure tests can complete in this story. The real Access Control permission endpoint,
post-commit projection update, freshness observation, reconciliation, and fail-closed authorization
integration remain blocked until Story 1-1 exposes its endpoint and observation contract; test
adapters must make that limitation explicit rather than claiming end-to-end completion.

**Current implementation state:** The People schema/migration, dedicated API boundary, frontend
screen, module registration, and focused unit tests are implemented. Shared-contract compatibility
coverage, the RabbitMQ publisher, full API/e2e matrix coverage, and all Story 1-1 integration checks
remain incomplete or blocked. Story 1-3 must remain `in-progress`.

## Blocked Integration Items

Story 1-3 remains `in-progress` and must not be marked done while these Story 1-1 dependencies are
unavailable:

- The real synchronous Access Control permission-decision API.
- The real post-commit projection-update endpoint.
- Access Control observation of People-side freshness uncertainty.
- Reconciliation and fail-closed authorization behavior based on that uncertainty.

People-side ports, safe default adapters, persistence, API/UI behavior, and adapter tests may be
completed independently. These adapters are test seams, not proof of cross-service integration.

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

- [ ] [Review][Patch] Department membership clearing is inconsistent for omitted input and the
  frontend empty form. `ChangeDepartmentDto` allows an omitted `departmentId`, while the service
  emits a revoke event with `afterId: null` but Prisma receives `departmentId: undefined` and
  therefore does not clear the stored relationship. The frontend also types the department ID as
  non-null and submits an empty string. Reject omission or normalize explicit clearing to `null`
  across DTO, service, API client, and tests. [services/people-service/src/modules/organisational-relationships/dto/change-department.dto.ts:4-9; services/people-service/src/modules/organisational-relationships/organisational-relationships.service.ts:40-41,138-140; services/frontend/src/api/organisationalRelationships.ts:7-24]
- [ ] [Review][Patch] Shared contract packaging and compatibility coverage remain missing. The
  contract is a standalone TypeScript file with no package boundary, published/export entry point,
  serialization round-trip test, or producer/consumer compatibility test; the Story task remains
  unchecked. [libs/contracts/relationship-events.ts:1-28]
- [ ] [Review][Patch] Outbox concurrency and retry behavior are only unit-tested through mocked
  query results. Add an integration test exercising two concurrent claimers, stale-lock recovery,
  next-attempt filtering, retry-limit transition, and ownership-safe status updates against the
  real Prisma/Postgres schema. [services/people-service/src/modules/outbox/outbox-publisher.service.ts:65-105,132-160]
- [ ] [Review][Patch] The full TypeScript project check currently fails in newly added test files:
  the People service helper types the Prisma transaction callback incorrectly, and the BFF test
  assigns a single-overload fetch spy to the overloaded global fetch type. Jest passes, but the
  test sources are not type-clean. [services/people-service/src/modules/organisational-relationships/__tests__/organisational-relationships.service.spec.ts:108; services/bff/src/modules/organisational-relationships/__tests__/organisational-relationships.service.spec.ts:13]
- [ ] [Review][Patch] The frontend renders every server failure as one generic message and has no
  tests for successful submissions, all four endpoint paths, validation/not-found/503 responses,
  or safe response details. The existing E2E test covers only screen rendering and one mocked 403
  click. [services/frontend/src/pages/OrganisationalRelationshipsPage/OrganisationalRelationshipsPage.tsx:32-47; services/frontend/e2e/app.spec.ts:21-40]
- [ ] [Review][Patch] Outbox startup and interval publication discard rejected promises with
  `void`; a database claim failure can become an unhandled rejection rather than being logged and
  retried in a controlled way. Add an explicit scheduler error boundary and test it. [services/people-service/src/modules/outbox/outbox-publisher.service.ts:37-40]

### Blocked by Story 1-1/authentication

- [x] [Review][Defer] Verified principal/authentication middleware is not present, so
  `RequestActorContext` cannot obtain `request.user.sub`; this must remain blocked rather than
  introducing trusted headers or temporary authentication. [services/people-service/src/modules/organisational-relationships/request-actor.context.ts:13-20]
- [x] [Review][Defer] The real Access Control permission-decision adapter, post-commit projection
  endpoint, freshness observation, reconciliation, and fail-closed cross-service integration are
  unavailable. The current adapters correctly fail closed and must not be treated as end-to-end
  authorization evidence. [services/people-service/src/modules/organisational-relationships/organisational-relationships.ports.ts:13-20]

### Out of scope

- [x] [Review][Defer] General S1 profile-write rejection is not implemented because no S1 update
  endpoint exists in this story; enforce it when the general profile-edit story lands.
- [x] [Review][Defer] Project-assignment relationship events, functional-role administration,
  full-profile-access grants, shared-link access, and reconciliation behavior belong to other
  stories or integrations.
