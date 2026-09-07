---
title: 'Story 1.11d: Access Control JWT authentication for Administration routes'
type: 'feature'
created: '2026-09-04'
status: 'in-progress'
baseline_commit: '987cb27dea072a9248f8a9f4185d7d23b33daaff'
review_loop_iteration: 0
context:
  - '{project-root}/docs/requirements/project-requirements.md'
  - '{project-root}/docs/decisions/ADR-002-people-access-control-relationship-boundary.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-4-functional-roles-and-permissions-as-runtime-editable-data.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-11-platform-authentication-via-keycloak.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-11b-bff-jwt-validation.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-11c-verified-identity-propagation.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-o4-142-principal-personid-mapping.md'
---

<frozen-after-approval reason="human-approved O4-156 scope; do not modify unless human renegotiates">

## Traceability

Jira: O4-156 — Access Control JWT authentication for Administration routes.
BMAD identifier: 1.11d.
Parent: Epic 1.
Dependency: O4-87 / Story 1.11 — Done.
Dependency: O4-142 principal-to-PersonId mapping — Done.
Consumer: Story 1.4 production Administration authentication dependency.

## Intent

**Problem:** Access Control Administration routes inspect request identity but do not currently
validate end-user JWT bearer tokens cryptographically.

**Approach:** Add ASP.NET Core JWT bearer authentication for the explicitly listed Administration
routes, construct `OidcPrincipalIdentity` only from the verified `ClaimsPrincipal`, and resolve it
through the existing O4-142 adapter before stored administration permission checks.

## Boundaries & Constraints

**Always:**
- Protect exactly these BFF-facing routes under `/api/v1`:
  - `GET /permissions/catalogue`
  - `GET /functional-roles`
  - `GET /functional-roles/{roleKey}`
  - `GET /functional-roles/{roleKey}/permissions`
  - `POST /functional-roles`
  - `PATCH /functional-roles/{roleKey}`
  - `POST /functional-roles/{roleKey}/deactivate`
  - `PUT /functional-roles/{roleKey}/permissions/{permissionKey}`
  - `DELETE /functional-roles/{roleKey}/permissions/{permissionKey}`
  - `POST /people/{personId}/functional-roles`
  - `DELETE /people/{personId}/functional-roles/{roleKey}`
  - `GET /people/{personId}/functional-roles`
- Keep `/api/v1/health` and `/api/v1/readiness` outside the end-user JWT policy.
- Keep `/api/v1/permissions/check` under its existing trusted-service policy only.
  An end-user bearer token alone must never authorize it.
- Do not use a global fallback policy that changes health, readiness, bootstrap/recovery, or
  trusted-service endpoint behavior.
- Validate signature, issuer, audience, algorithm, lifetime/expiry, and nonblank `sub`.
- Allow only `RS256`; do not read roles or permissions from token claims.
- Read `iss` and `sub` only from the verified `ClaimsPrincipal`.
- Resolve the verified identity through `IPrincipalPersonResolver`.
- Use the stored `manage-functional-roles-and-permissions` permission for Administration
  authorization.
- Fail closed on every authentication, identity, authorization, or dependency uncertainty.

**Configuration:**
- `OIDC_ALLOWED_ISSUERS` — required; exactly one canonical issuer for this service.
- `OIDC_AUDIENCE` — required; `bff-confidential`, matching the Keycloak realm audience mapper.
- No request data may supply issuer, metadata URL, JWKS URL, audience, algorithm, or authority.
- OIDC metadata is obtained from the configured issuer's discovery endpoint:
  `{issuer}/.well-known/openid-configuration`.
- JWKS is obtained from the discovery document's `jwks_uri`; it is never request-controlled.
- Production requires HTTPS issuer, metadata, and JWKS endpoints.
- Local HTTP is allowed only when `ASPNETCORE_ENVIRONMENT` is `Development`, `Test`, or `Local`;
  there is no production override.
- RS256 and a five-second clock tolerance are fixed implementation policy, matching the reviewed
  BFF authentication pattern.
- Missing, blank, malformed, multiple, or inconsistent production configuration fails startup
  before the service accepts traffic.

**Never:**
- Do not trust caller-supplied PersonId, actor, issuer, subject, or identity headers/body/query
  values.
- Do not treat an end-user token as trusted service identity.
- Do not implement trusted service-to-service authentication.
- Do not implement O4-146 token exchange/downscoped credentials.
- Do not implement the People permission-check adapter or deployment recovery.
- Do not modify BFF/frontend behavior, Story 1.5, functional-role policy, or database schema.
- Do not add anonymous, shared-secret, browser-token, or test-authentication production fallbacks.

## Deterministic error semantics

| Condition | Response |
|---|---|
| Missing/invalid bearer token, malformed token, invalid signature, issuer, audience, algorithm, lifetime, missing/blank `sub` | 401 |
| Authenticated principal with no active O4-142 mapping | 404 ProblemDetails, using the existing principal-resolution contract |
| Authenticated principal with ambiguous active O4-142 mapping | 409 ProblemDetails, using the existing principal-resolution contract |
| Temporarily unavailable People resolver or trusted credential dependency | 503 ProblemDetails |
| Authenticated and resolved principal without stored administration permission | 403 |
| Temporary metadata/JWKS retrieval failure | 401 challenge, matching ASP.NET Core JwtBearer fail-closed behavior |
| Invalid static production JWT configuration | Startup failure before accepting traffic |

Authentication failures must execute no Administration handler, mutation, permission-audit write,
or identity-resolution side effect. ProblemDetails and logs must not contain tokens, raw subjects,
secrets, or JWKS responses.

## Code Map

- `services/access-control-service/src/AccessControlService.Api/Program.cs` —
  register JwtBearer authentication and order routing, authentication, authorization, and
  controllers without applying a global fallback policy.
- `services/access-control-service/src/AccessControlService.Api/Configuration/AppConfig.cs` —
  validate `OIDC_ALLOWED_ISSUERS`, `OIDC_AUDIENCE`, canonical issuer rules, HTTPS requirements,
  and environment-specific local HTTP behavior.
- `services/access-control-service/src/AccessControlService.Api/Controllers/FunctionalRolesController.cs` —
  protect only the enumerated Administration routes and retain stored permission checks.
- `services/access-control-service/src/AccessControlService.Domain/Identity/` —
  reuse `OidcPrincipalIdentity` and `IPrincipalPersonResolver`; no JWT implementation here.
- `services/access-control-service/.env.example` —
  document the exact OIDC variables without secrets.
- `services/access-control-service/src/AccessControlService.Api/AccessControlService.Api.csproj` —
  add `Microsoft.AspNetCore.Authentication.JwtBearer`.
- `services/access-control-service/tests/AccessControlService.Api.Tests/` —
  add configuration, middleware, authorization, and HTTP-pipeline tests.
- `services/authentication-service/keycloak/realm-export.json` —
  read-only reference for the `people-management` realm, issuer path, RS256 signing, and
  `bff-confidential` audience.

## Tasks & Acceptance

**Execution:**
- [ ] Add `Microsoft.AspNetCore.Authentication.JwtBearer` as an intentional dependency.
  Its version must match the repository's .NET 8 dependency policy. Verify lock/restore impact,
  vulnerability scanning, and security review.
- [ ] Implement validated JwtBearer options for issuer, discovery/JWKS, audience, RS256,
  lifetime, required expiry, signed tokens, and five-second clock tolerance.
- [ ] Apply authentication only to the listed Administration routes.
- [ ] Keep health, readiness, permissions-check, bootstrap, and recovery boundaries unchanged.
- [ ] Construct `OidcPrincipalIdentity` only from the verified `ClaimsPrincipal`.
- [ ] Preserve the existing O4-142 missing, ambiguous, and unavailable resolution outcomes.
- [ ] Add signed-token HTTP tests with disposable Keycloak.
- [ ] Add negative tests proving no handler, mutation, or audit execution after authentication
  failure.
- [ ] Add package restore/build/test verification and configuration validation tests.
- [ ] Record migration impact as none and implement reversible rollback instructions.

**Acceptance Criteria:**
- Given a valid Keycloak-signed token, when any listed Administration route is called, then
  signature, issuer, `bff-confidential` audience, RS256 algorithm, lifetime, and nonblank `sub`
  are validated.
- Given successful validation, then `iss` and `sub` come only from the verified principal and are
  used to construct `OidcPrincipalIdentity`.
- Given a valid principal, then O4-142 resolution returns the authoritative PersonId and never
  treats raw `sub` as PersonId.
- Given any invalid or missing authentication condition, then the response is 401 and no
  Administration handler, resolver, mutation, or audit executes.
- Given a valid authenticated principal with no active mapping, then the response is 404.
- Given a valid authenticated principal with ambiguous mapping, then the response is 409.
- Given temporary People/resolver or trusted-credential unavailability, then the response is 503.
- Given successful authentication and Person resolution without the stored administration
  permission, then the response is 403 and no mutation or audit executes.
- Given caller-supplied identity values, then they cannot affect authorization.
- Given an end-user bearer token on `/api/v1/permissions/check`, then it is not accepted as
  trusted service identity.
- Given invalid production JWT configuration, then startup fails before accepting traffic.
- Given temporary metadata/JWKS retrieval failure, then JwtBearer returns a fail-closed 401
  challenge consistently with the integration tests.
- Given the complete route boundary, then health/readiness remain accessible without JWT and no
  global fallback policy changes excluded endpoints.
- No EF Core or Prisma migration is generated.

## Verification levels

1. **Real JWT validation:** disposable Keycloak proves the real discovery/JWKS pipeline and issues
   a valid signed token; the real Access Control HTTP pipeline proves the valid-token case and
   feasible negative cases using Keycloak-issued tokens, including expired, invalid-signature,
   wrong-issuer, and wrong-audience cases where technically possible.
2. **Controlled cryptographic JWT validation:** missing-`sub`, blank-`sub`, and
   disallowed-algorithm cases use narrowly scoped, cryptographically signed test tokens with
   test-only signing material and a controlled test issuer/JWKS configuration. These are real JWT
   cryptographic-validation tests, but are not described as Keycloak-issued evidence. No unsigned
   token, disabled signature validation, production test key, or authentication bypass is allowed.
3. **Controlled O4-142 resolution:** HTTP tests replace the resolver through a controlled test
   seam to prove resolved, missing, ambiguous, and unavailable outcomes. These tests do not prove
   live People communication.
4. **Live Access Control → People integration:** explicitly excluded and blocked until trusted
   service authentication exists. A valid JWT test must not claim this evidence.

## Dependency and External-Blocker Table

| Dependency | Status | Boundary |
|---|---|---|
| O4-87 / Story 1.11 | Done | Keycloak realm, issuer, JWKS, and audience foundation |
| O4-142 | Done | Principal-to-PersonId contract and adapter |
| Story 1.4 | In progress | Consumes this authentication dependency |
| Trusted service authentication | Not implemented | External blocker; excluded |
| People permission adapter | Not implemented | External Story 1.4 work; excluded |
| O4-146 | To Do | Token exchange/downscoping; excluded |

## Migration and rollback

Migration impact is none: no EF Core migration, Prisma migration, schema change, or seed change
is permitted.

The package, configuration, middleware, route metadata, and tests must be revertible as one
application change. Rollback must remove JWT registration and related configuration safely, but
must not introduce anonymous access, caller-controlled identity, shared-secret authentication, or
test-only authentication in production. If configuration is absent after rollback, the service
must fail closed or preserve the prior trusted-service boundary rather than accept traffic
without authentication.

## Verification commands

- `dotnet restore` — lock/restore impact and package vulnerability review are clean.
- `dotnet build --configuration Release` — clean build.
- `dotnet test --configuration Release` — all existing and new tests pass.
- Disposable-Keycloak HTTP integration suite — all positive and negative JWT cases pass.
- Configuration tests — invalid production configuration fails before traffic acceptance.
- Manual review — excluded routes retain their existing policies and no sensitive identity data
  appears in logs, ProblemDetails, responses, or audit records.

</frozen-after-approval>
