---
title: 'Story 1.11e: Trusted service authentication and live Administration saves'
type: 'feature'
created: '2026-09-08'
status: 'ready-for-dev'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-o4-146-trusted-service-authentication.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-o4-142-principal-personid-mapping.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-11d-access-control-jwt-validation.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-12-sign-in-and-sign-out-flow.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-13-persistent-session-store-and-oidc-e2e.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** O4-146 defines per-hop trusted service authentication, but the BFF still forwards
browser credentials and internal resolver calls still rely on shared secrets or caller-supplied
identity. The Administration UI therefore lacks a proven live authenticated save path through
Access Control and People.

**Approach:** Implement the approved Keycloak token-exchange and service-credential model, replace
header-based trust, bind resolver request bodies to verified token claims, provision the bootstrap
administrator through a deployment-authorized machine operation, and prove real Administration
saves end to end.

## Boundaries & Constraints

**Always:**
- Use Keycloak `quay.io/keycloak/keycloak:26.2.5`, the supported 26.2 maintenance release,
  with Standard Token Exchange v2, RFC 8693 delegation, per-service audiences, and
  `private_key_jwt`; private keys come from deployment configuration. All Compose and
  Testcontainers consumers use this same tag.
- Validate signed `iss`, `sub`, `azp`, and `aud` at every target. For delegated resolver calls,
  token claims are authoritative; body `issuer` and `subject` are retained only as a consistency
  check and must exactly equal verified `iss` and `sub`. A mismatch is 401.
- The bootstrap operator is authenticated by a deployment-authorized machine token; the target
  administrator identity is separate, independently resolved, idempotent, transactional, and
  audited.
- Return 401 for missing/invalid cryptography, claim or body/token binding mismatch, and wrong
  target audience. Return 403 only for a valid token with the correct audience but disallowed
  caller, endpoint, exchange, scope, or stored permission. Return 503 for exchange, JWKS,
  key-provider, or resolver unavailability without attempting the domain operation. Preserve
  404 for missing mappings and 409 for ambiguous mappings.
- Preserve O4-142 identity resolution and O4-156 stored Administration permission checks.

**Ask First:** Any deviation from O4-146's token modes, claim binding, fail-closed semantics,
or machine-versus-delegated identity boundary requires renewed human approval.

**Never:** Allow actor/person/issuer/subject headers or request-body identity to establish the
authenticated caller or delegated actor; forward raw browser tokens after cutover; combine client
credentials with actor headers; expose token exchange or bootstrap provisioning as a browser-facing
endpoint; place roles or permissions in Keycloak claims; weaken domain authorization ownership.
The deployment-only bootstrap endpoint may accept a separate target `(issuer, subject)` in its
request body only as input for independent identity resolution; that target can never authenticate
the operator or establish a delegated actor.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Delegated resolver | Valid delegated token plus matching body identity | People resolves the verified identity | 401 on claim/body mismatch or wrong audience |
| Bootstrap provisioning | Authorized machine token plus separate target identity | Seeded administrator is assigned once and audited | 400 malformed target body; 401 missing/invalid token; 403 valid but disallowed deployment caller; 404/409/503 per contract; no mutation on failure |
| Backchannel logout | `POST /api/v1/auth/backchannel-logout`, `Content-Type: application/x-www-form-urlencoded`, form field `logout_token` | BFF validates the Keycloak logout JWT and destroys sessions whose validated `sub` matches | 400 for missing, malformed, unverifiable, or invalid logout token |
| Administration save | Authenticated user with stored permission | Functional-role and custom-field saves persist through BFF and target services | 401/403/404/409/503 per contract |

## Service / Audience / Endpoint Matrix

| Caller | Token mode | Audience | Endpoint(s) | Identity authority |
|---|---|---|---|---|
| Browser -> BFF | PKCE session; not service auth | `client_id=bff-confidential` (no backend audience) | `GET /api/v1/auth/login`; `GET /api/v1/auth/callback`; `POST /api/v1/auth/logout`; `POST /api/v1/auth/backchannel-logout`; `GET /api/v1/auth/me` | BFF session; browser is never a backend caller |
| BFF -> People | RFC 8693 delegated user token | `people-service` | `PATCH /api/v1/organisational-relationships/people/:personId/manager`; `PATCH /api/v1/organisational-relationships/people/:personId/people-partner`; `PATCH /api/v1/organisational-relationships/people/:personId/department`; `PATCH /api/v1/organisational-relationships/departments/:departmentId/manager`; `GET /api/v1/custom-field-definitions`; `POST /api/v1/custom-field-definitions`; `PATCH /api/v1/custom-field-definitions/:id`; `DELETE /api/v1/custom-field-definitions/:id` | Verified user `iss/sub`; `azp=bff-confidential` |
| BFF -> Access Control | RFC 8693 delegated user token | `access-control-service` | `GET /api/v1/permissions/catalogue`; `GET /api/v1/functional-roles`; `GET /api/v1/functional-roles/:roleKey`; `GET /api/v1/functional-roles/:roleKey/permissions`; `POST /api/v1/functional-roles`; `PATCH /api/v1/functional-roles/:roleKey`; `POST /api/v1/functional-roles/:roleKey/deactivate`; `PUT /api/v1/functional-roles/:roleKey/permissions/:permissionKey`; `DELETE /api/v1/functional-roles/:roleKey/permissions/:permissionKey`; `GET /api/v1/people/:personId/functional-roles`; `POST /api/v1/people/:personId/functional-roles`; `DELETE /api/v1/people/:personId/functional-roles/:roleKey` | Verified user `iss/sub`; `azp=bff-confidential` |
| People -> Access Control | RFC 8693 delegated user token | `access-control-service` | `POST /api/v1/permissions/check` | Verified user `iss/sub`; `azp=people-service`; no caller-supplied actor headers |
| People -> Access Control | RFC 8693 delegated user token | `access-control-service` | `GET /api/v1/access-roles/resolve?viewerPersonId=:viewerPersonId&subjectPersonId=:subjectPersonId` | Verified user `iss/sub` binds to `viewerPersonId`; `azp=people-service` |
| Access Control -> People | RFC 8693 delegated token | `people-service` | `POST /api/v1/internal/identity-mappings/resolve` | Token `iss/sub` is authoritative; body must match exactly; `azp=access-control-service` |
| Deployment -> Access Control | Deployment-authorized client credentials | `access-control-service` | `POST /api/v1/internal/bootstrap/administrator` | Token authenticates operator; separate target identity is resolved, never substituted for operator |
| Background service -> target | Client credentials | Target service audience | Explicit internal endpoint only | Service `sub/azp`; no human delegation |

## Code Map

- `services/authentication-service/keycloak/realm-export.json`, `infra/docker-compose.yml`, and
  all Keycloak Testcontainers fixtures -- pin `quay.io/keycloak/keycloak:26.2.5`; configure
  service clients, audiences, token exchange, and local versioning; public realm configuration
  only, never private keys.
- `services/bff/src/modules/auth/oidc.service.ts` and `session.types.ts` -- retain the PKCE
  browser session and add server-side delegated-token exchange/credential acquisition.
- `services/bff/src/modules/functional-roles/functional-roles.controller.ts` and
  `functional-roles.service.ts` -- replace `resolveAuthorization()` raw-token forwarding with
  target-specific outbound credentials while preserving stable proxy routes.
- `services/access-control-service/src/AccessControlService.Api/Program.cs`,
  `Authorization/HeaderBasedTrustedServicePrincipalAuthorizer.cs`, and
  `Infrastructure/Identity/PeoplePrincipalPersonResolver.cs` -- replace shared-secret/header
  trust, enforce target audience and claim binding, and call People with a verified credential.
- `services/people-service/src/modules/identity-mappings/identity-resolution.controller.ts`,
  `internal-service-auth.guard.ts`, and `identity-resolution.service.ts` -- validate the signed
  caller token and require exact body/token identity equality while preserving 404/409/503.
- `services/access-control-service/src/AccessControlService.Api/Controllers/BootstrapController.cs`
  (new) and `AccessControlService.Infrastructure/Identity/` -- expose only the deployment
  authenticated `POST /api/v1/internal/bootstrap/administrator`, invoke the existing bootstrap
  service, and audit the verified operator separately from the target identity.
- `services/frontend/src/pages/AdministrationPage/` and its hooks/API modules -- preserve the
  existing save controls and verify them against live BFF responses; add only required error or
  session handling.
- Existing BFF, Access Control, People identity-mapping, bootstrap, and Testcontainers tests --
  extend them with claim-binding, outage, impersonation, bootstrap-entry-point, key-rotation,
  and live-save coverage. Story 1.12/1.13's PKCE/session tests remain dependencies, not
  duplicated implementation.

## Tasks & Acceptance

**Execution:**
- [ ] `authentication-service/keycloak/realm-export.json`, `infra/docker-compose.yml`, all
  Testcontainers fixtures, and service configuration -- pin `26.2.5`; configure exchange,
  audiences, clients, private-key injection, and rotation without committing secrets.
- [ ] `services/bff/src/modules/auth/` and functional-role proxy -- implement target-specific
  delegated or machine credentials and remove raw browser-token forwarding.
- [ ] Access Control authentication, trusted-service authorization, and People resolver client --
  validate `iss/sub/azp/aud`, enforce 401/403/503 semantics, and send verified identity.
- [ ] People identity-mapping guard/controller -- validate the Access Control token and require
  exact body/token claim equality.
- [ ] Access Control `POST /api/v1/internal/bootstrap/administrator` -- authenticate the
  deployment operator with a machine token, resolve the separate target identity, enforce
  idempotency, and audit verified operator claims without changing recovery code.
- [ ] Frontend Administration and affected tests -- prove real functional-role and custom-field
  saves, safe error handling, and no retry with raw browser credentials.
- [ ] All affected service test suites -- add real Keycloak `26.2.5`, resolver,
  negative-security, key-rotation/outage, bootstrap, and disposable-database E2E evidence.

**Acceptance Criteria:**
- Given a delegated token, when a target validates it, then `iss`, `sub`, `azp`, and `aud` bind
  the user, caller service, and target service.
- Given a resolver request, when body identity differs from delegated claims, then it returns
  401 and does not call or mutate People.
- Given a token with the wrong target audience, when it reaches a service, then it returns 401;
  403 is reserved for a valid correctly-audienced token lacking authorization.
- Given an authorized deployment operator and separate target identity, when bootstrap runs, then
  `POST /api/v1/internal/bootstrap/administrator` accepts only a valid deployment machine token,
  assigns the seeded administrator idempotently, and the audit records the verified operator
  (`iss`, `sub`, and `azp`), never substituting the target identity.
- Given a signed-in authorized user, when saving a functional role or custom field, then the
  real frontend-to-BFF-to-target path persists the change and refreshes the UI.
- Given any invalid, unauthorized, unavailable, missing, or ambiguous identity condition, then
  the specified 401/403/503/404/409 response occurs with no unauthorized side effect.

## Design Notes

**Body/token authority:** A verified token is the only authority for delegated `iss`, `sub`,
`azp`, and `aud`. Resolver body identity is not an alternate source of identity; it is an exact
equality check. Bootstrap is different: a deployment-authorized machine token authenticates the
operator, while a separate target `(issuer, subject)` is resolved as the person to provision.
The target cannot replace or impersonate the operator. The bootstrap endpoint is internal and
deployment-only; it is not registered as a browser-facing route and rejects a user-delegated
token, wrong audience, wrong `azp`, or missing machine credential.

**Bootstrap HTTP contract:** `POST /api/v1/internal/bootstrap/administrator` requires
`Authorization: Bearer <client-credentials-token>` with `aud=access-control-service` and
`azp=deployment-bootstrap`. Its JSON body is exactly
`{"issuer":"...","subject":"..."}` for the target identity. Malformed JSON, missing fields, or
invalid field shape returns 400. Missing, malformed, expired, unsigned, or wrongly-audienced
credentials return 401. A valid token from a caller other than the authorized deployment client
returns 403. Success returns `200` with `{"status":"provisioned"}` or
`{"status":"already-provisioned"}`. Mapping absence/ambiguity is 404/409, dependency/key-provider
failure is 503, and no assignment or audit row is written on failure.
The audit action is `bootstrap`; `TrustedProvisioningActor` records the verified operator as
`deployment:<iss>|<sub>|<azp>`, while the target remains in the audited assignment payload.

**Legacy trust replacement:** Remove `HeaderBasedTrustedServicePrincipalAuthorizer`,
`X-Internal-Service-Secret`, `X-Internal-Service-Identity`, `X-Delegated-Actor-Issuer`,
`X-Delegated-Actor-Sub`, `INTERNAL_SERVICE_SECRET`, and People’s
`InternalService <secret>` authorizer from protected production paths. Replace them with
Keycloak-signed bearer validation and the matrix’s `iss/sub/azp/aud` checks. Replace BFF
`resolveAuthorization()` session-token forwarding with server-side audience-specific exchange;
the browser session remains the only browser credential.

**Token lifecycle and keys:** Exchanged credentials are short-lived, audience-specific, server
side only, and never returned to the browser. A cached credential, if used, is bounded by its
expiry and keyed by caller, target audience, subject, and scope; expiry or logout requires a new
exchange, never the original browser token. JWKS refresh must honor `kid` changes. Key rotation
uses overlapping active/retiring keys for the maximum issued-token lifetime, private keys remain
deployment secrets, and tests prove old-key acceptance during overlap and rejection after expiry.

**Backchannel logout contract:** The BFF endpoint is public to Keycloak's backchannel request and
accepts only `application/x-www-form-urlencoded` with a single `logout_token` field. The field is
a signed logout JWT validated against the configured issuer/JWKS; its validated `sub` is the only
session lookup key and `sid`, when present, is not caller-controlled session identity. Missing,
malformed, unverifiable, or invalid logout tokens return 400. No browser access token or identity
header is accepted as a substitute.

**Rollout and rollback:** Provision target audiences and key providers first, then deploy target
validation, then BFF/People callers and the deployment bootstrap path. Validate the live
Administration saves before removing legacy trust. No compatibility fallback may accept raw
browser tokens or identity headers. Rollback may revert the deployment as a unit or disable the
operation, but must preserve fail-closed validation and must not restore header trust.

**Deterministic seeded test data:** Disposable fixtures use only the following fabricated,
deterministic subjects and mappings; no production identities, imported real-user subjects, or
additional unspecified principals are part of this story:
- `hr-admin` role `55555555-0000-0000-0000-000000000005` has active
  `manage-functional-roles-and-permissions` (`66666666-0000-0000-0000-000000000017`) and
  `manage-custom-fields` (`66666666-0000-0000-0000-000000000014`) grants.
- Deployment operator subject is the deterministic service principal
  `deployment-bootstrap-operator`; it has no Person mapping and is authorized only through
  `azp=deployment-bootstrap`.
- Issuer is `http://localhost:8080/realms/people-management`; existing opaque subjects are
  `c79186a1-2d9d-445b-a6e2-c64f6ccf11b6` -> Person
  `cccccccc-0000-0000-0000-000000000001` (admin), `e831fb31-8d50-47ad-b1db-d423afc87a0`
  -> Person `cccccccc-0000-0000-0000-000000000002` (no admin grant), and
  `7e5b85fe-1f88-4400-9cb9-bfca4530eb85` -> Person
  `cccccccc-0000-0000-0000-000000000019` (bootstrap target).
- The authorized save creates `story-1-11e-live-role` / `Story 1.11e Live Role` and
  `story-1-11e-live-field` / `TEXT` / `MANAGEMENT`; the non-admin repeats both attempts and
  receives 403 with no persistence or audit row.
- Bootstrap uses a deployment operator client and target principal
  with the existing target subject above, in a fresh database without an active `hr-admin`
  assignment. The operator subject is the deterministic service principal above and is written
  to the audit record.

**Merged login/session dependencies:** Story 1.12 supplies the PKCE S256 flow, five auth routes,
server-side token storage/refresh, and current bearer injection behavior. Story 1.13 supplies
the optional persistent `connect-pg-simple` store and real-Keycloak backchannel/logout E2E.
Story 1.11e must run its live Administration E2E through `/administration/functional-roles`
using a persistent session, exercise both functional-role and custom-field saves, and verify
`POST /api/v1/auth/backchannel-logout` still invalidates the session. It must not duplicate or
remove either story's login/session behavior.

**Recovery boundary:** Existing `IBootstrapRecoveryService`, `FunctionalRoleRecoveryService`,
and their DI registration/tests remain unchanged and out of scope. Story 1.11e changes only the
new deployment bootstrap endpoint and its authentication contract.

## Verification

**Commands:**
- `dotnet build --configuration Release` and `dotnet test --configuration Release` in
  `services/access-control-service` -- expected: build and tests pass.
- `npm run build`, `npm run lint`, and affected Jest/Playwright suites in BFF, People, and
  frontend -- expected: clean build/lint and authenticated save tests pass.
- Disposable-Keycloak and disposable-Postgres integration suites -- expected: real exchange,
  resolver, bootstrap, negative-security, and live Administration paths pass.

**Manual checks:**
- No committed private keys, secrets, tokens, production subjects, or personal data; only approved
  deterministic test identifiers are allowed.
- No browser-facing token-exchange/bootstrap endpoint and no trusted identity headers remain.
- Runtime implementation stays separate from O4-146's design artifact.

</frozen-after-approval>
