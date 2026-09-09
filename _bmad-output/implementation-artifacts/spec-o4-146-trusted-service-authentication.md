---
title: 'O4-146: Trusted service authentication and downscoped credentials'
type: 'feature'
created: '2026-09-07'
status: 'done'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-PeopleManagementSystem-2026-08-25/ARCHITECTURE-SPINE.md'
  - '{project-root}/docs/decisions/ADR-002-people-access-control-relationship-boundary.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-o4-142-principal-personid-mapping.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-11d-access-control-jwt-validation.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Backend calls currently forward the browser audience token between services, while
the Access Control permission path uses shared-secret and caller-supplied identity headers. This
does not provide per-hop audience isolation or a cryptographically bound delegated-user identity.

**Approach:** O4-146 records the platform security design/ADR: upgrade and pin Keycloak to a
26.2+ release, use Standard Token Exchange v2 (RFC 8693) for user-delegated calls, and use
dedicated client-credentials tokens for machine-only calls. Runtime implementation is a proposed
follow-up Story, not part of O4-146.

## Boundaries & Constraints

**Always:**
- The BFF remains the browser boundary and keeps its PKCE authorization-code flow.
- Exchanged user tokens preserve the verified `(issuer, subject)` needed by O4-142 and target one
  backend audience. A target accepts delegated user identity only when the Keycloak-signed token
  validates `iss`, `sub`, `azp`, and `aud` together: `iss` is the configured issuer, `sub` is the
  user to resolve through O4-142, `azp` is the authorized calling service client, and `aud` is the
  target service audience. The target rejects missing, malformed, or inconsistent bindings.
- Machine tokens identify only their calling service. A machine token cannot impersonate a human.
- Client private keys are deployment secrets; realm exports contain public configuration only.
- Access Control → People identity resolution uses a verified service bearer token and the existing
  `(issuer, subject)` contract; caller headers/body values never establish identity.
- Authentication, exchange, key, mapping, or authorization uncertainty fails closed.

**Ask First:** No additional design decisions. Any deviation from the selected Keycloak baseline,
RFC 8693 delegation, `private_key_jwt`, or client-credentials modes requires renewed approval.

**Never:**
- Do not use legacy preview token exchange, shared-secret authentication, trusted identity
  headers, browser-token forwarding after cutover, or client-credentials plus actor headers.
- Do not put access roles, functional roles, or permissions in Keycloak claims.
- Do not expose token exchange through a browser-facing endpoint or add direct-grant production
  login.
- Do not weaken O4-142 issuer/subject validation or change domain authorization ownership.
- O4-146 does not change application code, realm exports, compose files, client configuration,
  service endpoints, migrations, or deployment secrets.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|----------------------------|----------------|
| User-delegated call | Keycloak-signed token with valid `iss`, user `sub`, caller `azp`, and target `aud` | Target authenticates the service and resolves the user subject through O4-142 | Invalid/missing claim binding returns 401 |
| Machine-only call | Valid service client-credentials token with caller `sub`/`azp` and target `aud` | Target authenticates only the service principal | Invalid token returns 401; valid but disallowed caller returns 403 |
| Unauthorized exchange | Caller requests an unpermitted target audience or scope | Keycloak denies exchange | Caller receives 403; no original-token fallback |
| Trust dependency outage | Exchange endpoint, JWKS, key provider, or resolver unavailable | Protected operation is not attempted | 503 with no domain side effect |
| Forged delegation | Caller supplies actor/person/issuer headers or body values | Values have no authorization effect | 401 if token binding is absent/invalid; otherwise ignore them |

## Service / Audience / Endpoint Matrix

| Caller | Token mode | Audience | Target endpoint(s) | Delegated binding |
|---|---|---|---|---|
| Browser → BFF | PKCE session; not service auth | BFF browser client | `/api/v1/auth/login`, `/callback`, `/logout`, `/me` | Browser is never a trusted backend caller |
| BFF → People | RFC 8693 exchanged user token | `people-service` | `PATCH /api/v1/organisational-relationships/people/:personId/manager`, `/people/:personId/people-partner`, `/people/:personId/department`, `/departments/:departmentId/manager`; `GET/POST/PATCH/DELETE /api/v1/custom-field-definitions[/:id]` | `iss` + user `sub` + `azp=bff-confidential` + `aud=people-service` |
| BFF → Access Control | RFC 8693 exchanged user token | `access-control-service` | `GET /api/v1/permissions/catalogue`, `GET/POST/PATCH /api/v1/functional-roles[/:roleKey]`, `GET /api/v1/functional-roles/:roleKey/permissions`, `POST /api/v1/functional-roles/:roleKey/deactivate`, `PUT/DELETE /api/v1/functional-roles/:roleKey/permissions/:permissionKey`, `GET/POST/DELETE /api/v1/people/:personId/functional-roles[/:roleKey]` | `iss` + user `sub` + `azp=bff-confidential` + `aud=access-control-service` |
| People → Access Control | Client credentials or exchanged user token, per operation | `access-control-service` | `POST /api/v1/permissions/check` | Machine call: service-only; delegated call additionally requires user `sub` and `azp=people-service` |
| People → Access Control | RFC 8693 exchanged user token | `access-control-service` | `GET /api/v1/access-roles/resolve?viewerPersonId=:viewer&subjectPersonId=:subject` | `iss` + user `sub` must bind to `viewerPersonId`; `azp=people-service` + target `aud` |
| Access Control → People | RFC 8693 exchanged user token | `people-service` | `POST /api/v1/internal/identity-mappings/resolve` | `iss` + user `sub` is the only identity source; `azp=access-control-service` + target `aud` |
| Background service → target | Client credentials | Target service audience | Explicit internal endpoint only | Service `sub`/`azp`; no human delegation |

## Deterministic Authentication Semantics

- **401 Unauthorized:** missing or malformed bearer token; invalid signature, issuer, audience,
  algorithm, expiry, `nbf`, token type, or required `iss`/`sub`/`azp` binding; binding mismatch;
  caller-supplied identity cannot repair a failed binding.
- **403 Forbidden:** cryptographically valid token whose caller service is not authorized for the
  target endpoint, audience, exchange, scope, or stored operation permission.
- **503 Service Unavailable:** token exchange, JWKS/key retrieval, private-key provider, or
  identity-mapping dependency is temporarily unavailable. No protected domain operation runs.
- Existing O4-142 mapping outcomes remain **404** for missing/revoked identity and **409** for
  ambiguous active mappings; these are not converted into authentication failures.

## Code Map

- `docs/decisions/` -- proposed ADR record of the selected Keycloak, token-exchange, binding,
  endpoint, and error semantics.
- `_bmad-output/implementation-artifacts/spec-o4-146-trusted-service-authentication.md` -- this
  design task and the proposed follow-up Story boundary.
- `infra/docker-compose.yml`, `services/authentication-service/keycloak/realm-export.json`,
  `services/bff/src/modules/auth/`, `services/access-control-service/src/`, and
  `services/people-service/src/modules/identity-mappings/` -- read-only evidence and exact
  implementation seams for the follow-up Story; no changes in O4-146.
- `spec-o4-142-principal-personid-mapping.md` and `spec-1-11d-access-control-jwt-validation.md`
  -- preserve the existing issuer/subject mapping and end-user JWT validation contracts.

## Tasks & Acceptance

**Execution:**
- [x] Record the selected Keycloak 26.2+ / Standard Token Exchange v2 design as an ADR, including
  the service/audience/endpoint matrix and deterministic error semantics.
- [x] Record the cryptographic delegated-user binding contract: signed `iss`, `sub`, `azp`, and
  `aud`; O4-142 maps only the verified user `(iss, sub)`; no identity headers are trusted.
- [x] Define the proposed follow-up Story with implementation scope, migration sequence, rollback
  constraints, and required Keycloak, service, contract, and negative-security tests.
- [x] Validate the design against the architecture spine, O4-142, O4-156, and current Keycloak
  capabilities without changing runtime artifacts.

**Acceptance Criteria:**
- Given the selected authentication modes, when the design is reviewed, then every caller, target
  audience, endpoint, identity binding, and error outcome is represented in this specification.
- Given a delegated user token, when its claims are evaluated, then `iss`, `sub`, `azp`, and `aud`
  cryptographically bind the user, caller service, and target service without trusted headers.
- Given a valid service token, when it is used on an endpoint outside its matrix row, then the
  deterministic 403 policy applies and no operation-specific permission is inferred from claims.
- Given any invalid cryptographic condition, when the endpoint is called, then the deterministic
  401 policy applies; dependency outage uses 503 and does not fall back open.
- Given the design is approved, when implementation is scheduled, then it is represented by a
  separate proposed follow-up Story and not by O4-146 runtime changes.

## Proposed Follow-up Story: Trusted service authentication implementation

**Scope:** Implement the approved matrix and binding contract across Keycloak, BFF, Access Control,
People, and their integration tests. This proposed Story owns all runtime, realm, configuration,
secret-injection, migration, compatibility-window, and rollback work excluded from O4-146.

**Minimum acceptance criteria:**
- Keycloak 26.2+ Standard Token Exchange v2 issues target-audience tokens only to explicitly
  authorized clients; confidential clients authenticate with `private_key_jwt`.
- BFF user calls and service-to-service calls use the matrix above; raw browser tokens and trusted
  identity headers are absent from production paths after cutover.
- Each target validates signed `iss`, `sub`, `azp`, and `aud` binding and returns the specified
  401/403/503 outcomes.
- Access Control → People and People → Access Control integration tests prove delegated-user
  binding, machine-only non-impersonation, O4-142 mapping, key rotation, outage handling, and
  caller-controlled identity rejection.
- Rollout and rollback preserve fail-closed authorization and never re-enable arbitrary headers.

## Design Notes

Keycloak 26.0 documents token exchange as Preview and disabled by default; Standard Token Exchange
v2 is the supported RFC 8693 path in 26.2+. The signed binding is deliberately explicit: a target
does not trust a copied actor value; it verifies the issuer signature and checks the relationship
between `iss`, user `sub`, authorized party `azp`, and target `aud`. The implementation Story must
prove that the selected Keycloak release emits and validates this claim set; if it cannot, it must
halt rather than substitute a caller-controlled header.

## Verification

**Commands:**
- `git diff --check` -- expected: no whitespace errors.
- Manual architecture review -- expected: the matrix, signed binding, deterministic errors, and
  proposed follow-up Story agree with O4-142, O4-156, ADR-002, and the architecture spine.
- Keycloak documentation review -- expected: the selected 26.2+ Standard Token Exchange v2 and
  `private_key_jwt` capabilities remain supported; no runtime test is claimed for this design task.

**Actual result:** PR #54 merged to `main` as `93e60e4`. The design was approved and validated
without runtime, Keycloak configuration, dependency, contract, migration, or deployment-secret
changes. Runtime implementation remains the responsibility of the proposed follow-up Story.

</frozen-after-approval>
