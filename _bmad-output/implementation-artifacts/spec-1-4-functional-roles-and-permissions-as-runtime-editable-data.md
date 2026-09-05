---
title: 'Story 1.4: Functional roles and permissions as runtime-editable data'
type: 'feature'
created: '2026-09-02'
status: 'in-progress'
review_loop_iteration: 0
baseline_commit: 'ddb4f64064bc40caaa2447d7b78aba208213164a'
context:
  - '{project-root}/docs/requirements/project-requirements.md'
  - '{project-root}/docs/access-control/section-matrix.md'
  - '{project-root}/docs/decisions/ADR-002-people-access-control-relationship-boundary.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="approved product decisions — do not modify unless human renegotiates">

## Intent

**Problem:** Functional permissions are not stored or administered, so new feature roles cannot be
created without code changes and Story 1.3 cannot perform its real permission check.

**Approach:** Add runtime-editable functional-role data, a canonical permission catalogue, scoped
grants, administration APIs/UI, an atomic authorization-administration audit trail, and a
permission-decision endpoint for People Service.

## Scope, terminology, and invariants

UM, DM, PM, PP, and HR Admin are seeded **functional roles**, explicitly assigned to people.
Manager and People Partner are relationship-derived **access roles**, resolved independently for
each viewer/subject. A functional role never creates a relationship or widens profile-data
visibility. There is no relationship-to-functional-role mapping and no direct person-permission
grant. Authorization uses stored permission keys plus relationship decisions, never role-name
comparisons. HR Admin is configuration-only; profile data requires separate Full profile access.

**Always:** Permission and assignment changes are effective on the next request. Role, grant, and
assignment mutations require `manage-functional-roles-and-permissions`, are audited atomically,
and fail if the final active holder of that permission would be removed.
An administrator may modify their own non-final assignments, but cannot revoke their own final
administrator capability. Seeded roles cannot be re-keyed or deactivated; their editable grants
remain subject to the same zero-holder invariant.

**Ask First:** None; the product decisions are approved.

**Never:** Do not implement Full profile access, relationship mutation, profile assembly, or
role-name authorization. Do not trust caller-supplied actor identity. Do not expand the existing
six-category narrow access-control journal.

## Canonical permission catalogue and seed matrix

Permission keys:
`create-form-campaigns`, `create-action-items`, `create-edit-risks`,
`create-resourcing-requests`, `fulfil-resourcing-requests`,
`approve-reject-resourcing-candidates`, `close-resourcing-requests`, `assign-mentors`,
`maintain-cds-records`, `edit-career-timeline`, `create-feedback`, `record-departure`,
`manage-departments`, `manage-custom-fields`, `change-organisational-relationships`,
`manage-system-dictionaries`, `manage-functional-roles-and-permissions`, `view-dashboard`.

`view-dashboard` is one permission with scope `{"dashboardType":"unit-manager|delivery-manager|project-manager|people-partner"}`. `record-departure` has no initial grant.

| roleKey | permissionKey | scope |
|---|---|---|
| unit-manager | fulfil-resourcing-requests | null |
| unit-manager | create-edit-risks | null |
| unit-manager | create-action-items | null |
| unit-manager | assign-mentors | null |
| unit-manager | maintain-cds-records | null |
| unit-manager | view-dashboard | `{"dashboardType":"unit-manager"}` |
| delivery-manager | create-resourcing-requests | null |
| delivery-manager | approve-reject-resourcing-candidates | null |
| delivery-manager | close-resourcing-requests | null |
| delivery-manager | create-edit-risks | null |
| delivery-manager | create-action-items | null |
| delivery-manager | maintain-cds-records | null |
| delivery-manager | assign-mentors | null |
| delivery-manager | view-dashboard | `{"dashboardType":"delivery-manager"}` |
| project-manager | create-resourcing-requests | null |
| project-manager | create-edit-risks | null |
| project-manager | create-action-items | null |
| project-manager | maintain-cds-records | null |
| project-manager | assign-mentors | null |
| project-manager | view-dashboard | `{"dashboardType":"project-manager"}` |
| people-partner | create-form-campaigns | null |
| people-partner | create-action-items | null |
| people-partner | create-edit-risks | null |
| people-partner | assign-mentors | null |
| people-partner | maintain-cds-records | null |
| people-partner | edit-career-timeline | null |
| people-partner | create-feedback | null |
| people-partner | view-dashboard | `{"dashboardType":"people-partner"}` |
| hr-admin | manage-departments | null |
| hr-admin | manage-custom-fields | null |
| hr-admin | manage-system-dictionaries | null |
| hr-admin | manage-functional-roles-and-permissions | null |
| hr-admin | change-organisational-relationships | null |

Seeds are editable stored data. Migration seeds only the catalogue, functional roles, and approved
default grants; it never contains a deployment identity or bootstrap assignment. Explicit
provisioning is idempotent, preserves custom roles/grants, and never silently revokes an existing
grant.

## Data model and scoped grants

Add `Permission`, `FunctionalRole`, `FunctionalRolePermissionGrant`,
`PersonFunctionalRoleAssignment`, and append-only `AuthorizationAdministrationAudit` entities.
Grants store a permission key and normalized optional scope JSON; only `view-dashboard` accepts
`dashboardType`, and invalid or missing required scopes return 400. Assignments store person,
role, active/revoked state, and timestamps. Generate an EF Core migration using existing
Infrastructure conventions. Grant uniqueness is enforced by two partial unique indexes: one on
`(FunctionalRoleId, PermissionId)` for unscoped grants and one on
`(FunctionalRoleId, PermissionId, Scope)` for scoped grants. Existing duplicate unscoped data
must cause a forward migration to fail clearly; it must never be deleted or silently merged.

Every administration mutation serializes on the canonical active
`manage-functional-roles-and-permissions` permission row. Authorization is evaluated only after
that row is locked inside the mutation transaction. The global lock order is: reconciliation
transaction-level advisory lock when reconciliation is involved, canonical administration
permission row, target functional-role row, target permission, then target grant or assignment.
Permission-check queries remain read-only and do not acquire this mutation serialization lock.

Define `IPrincipalPersonResolver` at the Access Control application boundary. People Service owns
the authoritative identity link; its adapter resolves a validated Keycloak `sub` to `PersonId`.
The current JWT implementations validate signature, issuer, audience, algorithm, expiry, and
nonblank `sub`, then expose only `{ sub }`; they do not expose role or permission claims.
Production end-user JWT validation for Access Control administration routes, separately trusted
service-to-service credentials for the permission-check route, and the principal-to-PersonId
adapter are external integration dependencies. In their absence, both boundaries remain
fail-closed and no caller-controlled identity is accepted.

## Administration API

All administration routes under `/api/v1` are user-facing through the BFF. They require a
cryptographically verified end-user JWT, derive `sub` only from the authenticated
`ClaimsPrincipal`, resolve that `sub` to `PersonId`, and return `401` for missing or invalid
identity. All administration mutations require the effective stored
`manage-functional-roles-and-permissions` grant; failures return `403`. The actor is never a DTO
field, query parameter, or arbitrary header.

| Method and route | Request DTO | Response/status | Required stored permission | Validation, idempotency, and errors |
|---|---|---|---|---|
| `GET /permissions/catalogue` | none | `PermissionCatalogueResponse` / 200 | `manage-functional-roles-and-permissions` | Active catalogue only; 401/403/503 |
| `GET /functional-roles` | none | `FunctionalRoleListResponse` / 200 | `manage-functional-roles-and-permissions` | 401/403/503 |
| `GET /functional-roles/{roleKey}` | none | `FunctionalRoleResponse` / 200 | `manage-functional-roles-and-permissions` | Key format; 400/401/403/404/503 |
| `GET /functional-roles/{roleKey}/permissions` | none | `FunctionalRolePermissionListResponse` / 200 | `manage-functional-roles-and-permissions` | Current effective stored grants only; deterministic `permissionKey`, normalized `scope`, then stable grant identifier ordering; 401/403/404/503 |
| `POST /functional-roles` | `CreateFunctionalRoleRequest { roleKey, displayName }` | `FunctionalRoleResponse` / 201 | `manage-functional-roles-and-permissions` | Unique key/name; 400/401/403/409/503; replayed idempotency key returns original 201 |
| `PATCH /functional-roles/{roleKey}` | `UpdateFunctionalRoleRequest { displayName }` | `FunctionalRoleResponse` / 200 | `manage-functional-roles-and-permissions` | Seeded roles cannot be re-keyed; 400/401/403/404/409/503; same values are a 200 no-op |
| `POST /functional-roles/{roleKey}/deactivate` | `DeactivateFunctionalRoleRequest { reason }` | `FunctionalRoleResponse` / 200 | `manage-functional-roles-and-permissions` | Destructive delete forbidden; seeded roles/active assignments return 409; repeat is 200; 400/401/403/404/409/503 |
| `PUT /functional-roles/{roleKey}/permissions/{permissionKey}` | `GrantPermissionRequest { scope }` | `FunctionalRolePermissionResponse` / 200 | `manage-functional-roles-and-permissions` | Known key/exact scope; idempotent; 400/401/403/404/409/503 |
| `DELETE /functional-roles/{roleKey}/permissions/{permissionKey}` | optional `scope` query | 204 | `manage-functional-roles-and-permissions` | Idempotent absent grant; final-administrator check; 400/401/403/404/409/503 |
| `POST /people/{personId}/functional-roles` | `AssignFunctionalRoleRequest { roleKey }` | `AssignmentResponse` / 201 or 200 | `manage-functional-roles-and-permissions` | Existing person/active role; idempotent assignment returns 200; 400/401/403/404/409/503 |
| `DELETE /people/{personId}/functional-roles/{roleKey}` | none | 204 | `manage-functional-roles-and-permissions` | Idempotent absent assignment; final-administrator check; 401/403/404/409/503 |
| `GET /people/{personId}/functional-roles` | none | `FunctionalRoleAssignmentListResponse` / 200 | `manage-functional-roles-and-permissions` | Active assignments only; 400/401/403/404/503 |
| `POST /permissions/check` | `PermissionCheckRequest { permissionKey, scope }` | `PermissionCheckResponse { granted }` / 200 | Separately trusted service principal, not a functional-role permission | Domain-to-domain only; an arbitrary end-user bearer token is not a trusted service identity; actor derived from the verified service principal context; 400/401/403/409/503 |

The table routes are relative to `/api/v1`. All DTOs reject unknown fields, blank keys, malformed
scope JSON, and invalid UUID path parameters. Mutation DTOs support an idempotency key where they
create state; replay returns the original result and creates no second audit record. The permission
check returns 200 for either decision, requires a separately trusted service principal, derives
the actor from that platform-established trusted principal context, resolves the
principal-to-PersonId port, and never accepts an actor ID in a body, query, arbitrary header, or
an end-user bearer token treated as service identity. People Service calls it through its existing
`RelationshipPermissionPort`, supplying the platform-established service context. `409` is
reserved for concurrent conflicts.

`GET /functional-roles/{roleKey}/permissions` returns current effective stored grants for the
active role, joining active permissions only. Each record contains the stable grant identifier,
permission key, and scope as `null` or canonical normalized JSON. It requires verified
authentication and the stored `manage-functional-roles-and-permissions` permission, uses no
role-name authorization, returns no inferred or session-only grants, and orders records
deterministically by permission key, canonical scope, then grant identifier.

## Bootstrap and audit

Ordinary Access Control web-service startup must not require
`FUNCTIONAL_ROLE_BOOTSTRAP_SUB`, call People identity resolution, or silently create an
administrator. It continues to expose health endpoints even when the database or authorization
dependencies are unavailable. Administration requests fail closed when authentication, principal
mapping, or required stored permissions are unavailable. Existing installations start normally
without rerunning provisioning; an installation with no active functional-role administrator
exposes only a safe operational/readiness state and continues to deny normal administration.

Bootstrap is an explicit deployment operation separate from normal web-service startup. Its
application contract is:

`ProvisionBootstrapAdministratorAsync(BootstrapProvisioningRequest request, CancellationToken
cancellationToken) -> BootstrapProvisioningResult`

`BootstrapProvisioningRequest` contains only the configured opaque trusted `PrincipalSub`; it
accepts no `PersonId`, role key, permission key, or caller identity override. The operation
requires `FUNCTIONAL_ROLE_BOOTSTRAP_SUB` only when explicitly invoked, validates it as a non-empty
Keycloak `sub` of at most 255 characters with no whitespace, resolves it through
`IPrincipalPersonResolver`, whose provisioning seam must distinguish
`Resolved(PersonId)`, `Unavailable`, and `Ambiguous` results rather than collapsing them into a
nullable identifier. It fails without writes when configuration is missing/invalid, the resolver
is unavailable, or resolution is ambiguous. On successful resolution it idempotently
ensures the seeded HR Admin functional role and approved stored grants exist, then creates the
active assignment if absent. A repeated invocation for the same already-assigned identity is a
no-op. The assignment and one `bootstrap` authorization-administration audit record commit in
one transaction; an audit failure rolls back the assignment. The operation never uses a role-name
authorization shortcut.

The local Story 1.4 seam may expose this contract through an application service/command handler
with deterministic resolver and persistence ports for unit and integration tests. It must not
create an insecure executable, temporary identity path, or production bypass. The production
deployment runner, configuration secret, and People-owned principal mapping remain external.

Recovery is a separate deployment-only contract, not an ordinary HTTP route:

`RecoverBootstrapAdministratorAsync(DeploymentAuthenticatedRecoveryRequest request,
CancellationToken cancellationToken) -> RecoveryProvisioningResult`

It requires independently authenticated deployment/operator authority, accepts an opaque trusted
`sub` but no raw `PersonId` or user-controlled header/body identity, resolves it through the same
resolver, restores the seeded HR Admin assignment atomically, and writes a `recovery` audit
record. It is the only zero-holder exception and cannot authorize through `hr-admin` text or
bypass stored permission checks. Production recovery execution remains blocked until deployment
authentication exists.

The audit entity contains `auditId`, `action`, `targetType`, `targetId`, `actorPersonId` or
trusted provisioning actor, nullable `permissionKey`, nullable normalized `scope`, structured
`before`, structured `after`, `occurredAtUtc`, and correlation ID. Actions are `role-create`,
`role-update`, `role-deactivate`, `permission-grant`, `permission-revoke`, `assignment-create`,
`assignment-revoke`, `bootstrap`, and `recovery`. Every mutation and its audit record commit in
one transaction; a failed audit write rolls back the mutation. The six-category narrow journal is
unchanged.

## BFF, UI, tests, and delivery boundary

Add a BFF module that forwards these operations without owning policy, and an Administration page
for role creation/editing/deactivation, permission selection with scope validation, and person
assignment. It must use i18n and expose no profile-data access through HR Admin.

Test the complete API matrix above: every 200/201/204/400/401/403/404/409/503 path, including the
functional-role permission-grant read route and its empty, normalized, unauthorized, forbidden,
not-found, and unavailable cases, invalid keys and scopes, role-only grants, immediate
revocation, seeded-role behavior, self-modification, deactivation, concurrent final-administrator
removal, audit atomicity, idempotent seed/bootstrap, scoped dashboards, and active-assignment
listing. Provisioning tests must cover missing/empty bootstrap `sub`, unresolved and ambiguous
principals, first idempotent assignment, repeated provisioning, audit-failure rollback, startup
of an existing installation without provisioning, safe zero-administrator operational state, and
recovery authorization unavailable. Include negative tests proving a PM-named functional role
creates no Project-line access and no permission widens profile sections. Add trusted-principal
mapping, Story 1.3 adapter, BFF, UI, migration, and persistence tests.

Locally completable: the provisioning application/command seam, deterministic resolver and
persistence ports, idempotent seed tests, existing-installation startup/readiness behavior, and
BFF/UI contract tests with trusted test principals. Test principals and mocked adapters are not
production identity evidence. Externally blocked: production service-to-service authentication,
production principal propagation/mapping, authenticated recovery execution, real People Service
integration, and E2E identity verification. Story 1.4 remains `in-progress` and cannot be marked
`done` until those dependencies are integrated and verified. Open PR #31 (Story 1.6) is separate;
do not touch its files.

## Proposed files

Access Control: `src/AccessControlService.Domain/Permissions/`,
`src/AccessControlService.Domain/Identity/IPrincipalPersonResolver.cs`, the existing
`src/AccessControlService.Infrastructure/Permissions/` application-service boundary for
provisioning request/result/handler ports and implementation, `src/AccessControlService.Infrastructure/Persistence/`
permission/role/assignment/audit entities and EF migration, `src/AccessControlService.Api/Controllers/PermissionsController.cs`,
`src/AccessControlService.Api/Controllers/FunctionalRolesController.cs`, deployment provisioning
integration files, and corresponding Domain/Infrastructure/Api tests. No new Application project
is required by this story.
BFF: `src/modules/functional-roles/` and `src/app.module.ts`.
Frontend: `src/api/functionalRoles.ts`, `src/pages/AdministrationPage/`, `src/router/index.tsx`, `src/components/SideMenu/SideMenu.tsx`, and translations.

</frozen-after-approval>

## Tasks & Acceptance

**Execution:**
- [ ] `src/AccessControlService.Infrastructure/Persistence/Permission.cs`, `FunctionalRole.cs`,
  `FunctionalRolePermissionGrant.cs`, `PersonFunctionalRoleAssignment.cs`, and
  `AuthorizationAdministrationAudit.cs` -- add entities, constraints, indexes, and EF mappings.
- [ ] `src/AccessControlService.Infrastructure/Persistence/Migrations/` -- generate an idempotent
  migration and seed the catalogue, functional roles, and approved grants only; the deployment
  identity and bootstrap assignment must be created only by the explicit provisioning operation.
- [ ] `src/AccessControlService.Domain/Permissions/` and
  `src/AccessControlService.Domain/Identity/IPrincipalPersonResolver.cs` -- implement key/scope
  validation and permission evaluation without role-name checks.
- [ ] `src/AccessControlService.Api/Controllers/PermissionsController.cs` and
  `FunctionalRolesController.cs` -- implement every Administration API route and permission check.
- [ ] `services/people-service/src/modules/organisational-relationships/` -- replace the
  unavailable adapter through its existing port after the trusted integration contract is available.
- [ ] `services/bff/src/modules/functional-roles/` and
  `services/frontend/src/pages/AdministrationPage/` -- add the proxy and Administration UI.
- [ ] `tests/AccessControlService.*`, `services/bff/src/modules/functional-roles/`, and
  `services/frontend/e2e/` -- implement the complete API, persistence, authorization, integration,
  BFF, UI, and negative test matrix.

**Acceptance Criteria:**
- Given each Administration API operation, when a caller lacks the required stored permission, then it returns 403 and persists neither domain state nor audit state.
- Given a valid role, grant, assignment, catalogue, or permission-check request, when it is submitted, then the response and status match the API contract, including validation and 400/401/404/409/503 cases.
- Given a repeated create, grant, assignment, deactivate, or bootstrap request, when the same idempotency key or state is submitted, then it produces no duplicate state or audit record.
- Given a functional role named PM, when its holder accesses a subject, then no Project-line access is created and no profile section is widened.
- Given a role or assignment administrator, when they modify themselves or a seeded role, then only the permitted non-final changes succeed; the final administrator cannot be removed or revoked.
- Given any role, grant, assignment, bootstrap, or recovery mutation, when it commits, then one atomic authorization audit record contains the specified actor, target, permission/scope, before/after, timestamp, and correlation ID.
- Given a new or existing installation, when idempotent seeding runs, then approved defaults are present, custom roles/grants remain, and no existing grant is silently revoked.
- Given ordinary Access Control startup, when `FUNCTIONAL_ROLE_BOOTSTRAP_SUB` is missing or the
  People identity resolver is unavailable, then startup does not invoke provisioning or create an
  administrator, health endpoints remain exposed, and administration requests fail closed.
- Given an explicit provisioning invocation, when the bootstrap `sub` is missing, empty, invalid,
  unresolved, or ambiguous, then it exits without any assignment, grant, or audit write.
- Given an explicit provisioning invocation with a resolvable trusted `sub`, when no assignment
  exists, then the seeded HR Admin assignment and exactly one atomic bootstrap audit record are
  created; repeating the invocation produces no duplicate assignment or audit record.
- Given an authorization-audit persistence failure during provisioning, when the assignment is
  attempted, then the transaction rolls back the assignment and leaves no partial provisioning
  state.
- Given an existing installation, when ordinary startup occurs without provisioning, then it
  starts normally and does not rerun provisioning; a zero-administrator state is observable only
  through safe operational/readiness status and normal administration remains denied.
- Given recovery authorization is unavailable, when deployment-only recovery is invoked, then no
  assignment or audit write occurs and no ordinary HTTP administration route can invoke recovery.
- Given an existing installation, when ordinary startup occurs without
  `FUNCTIONAL_ROLE_BOOTSTRAP_SUB`, then startup does not fail because of the absent setting, does
  not invoke People identity resolution, does not rerun provisioning, continues to expose health
  endpoints, and does not silently create an administrator.
- Given a validated principal, when People Service calls permission check, then the actor is resolved through the trusted principal-to-PersonId port; unavailable identity or permission dependencies fail closed with 503.
- Given test principals or mocked adapters, when tests pass, then they are not treated as evidence of production authorization; Story 1.4 remains incomplete until trusted service-to-service authentication, identity mapping, and the real Story 1.3 integration are verified.

## Spec Change Log

- 2026-09-03: Added the approved `GET /api/v1/functional-roles/{roleKey}/permissions` contract
  for deterministic authoritative reads of current stored role grants across Access Control,
  BFF, frontend, and focused tests.
- 2026-09-03: Clarified bootstrap as an explicit deployment operation separate from ordinary
  Access Control startup, defined local provisioning/recovery seams, and added bootstrap,
  existing-installation, zero-administrator, and recovery acceptance/test coverage.

## Verification

**Commands:**
- `cd services/access-control-service && dotnet build --configuration Release` -- expected: clean build.
- `cd services/access-control-service && dotnet test --configuration Release` -- expected: domain, persistence, API, and migration tests pass.
- `cd services/bff && npm run build && npm test` -- expected: BFF contract tests pass.
- `cd services/frontend && npm run typecheck && npm run lint && npm run test` -- expected: Administration flow checks pass.
