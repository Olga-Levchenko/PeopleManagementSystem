---
title: 'O4-142: OIDC principal-to-PersonId mapping'
type: 'feature'
created: '2026-09-04'
status: 'ready-for-dev'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-4-functional-roles-and-permissions-as-runtime-editable-data.md'
  - '{project-root}/docs/decisions/ADR-002-people-access-control-relationship-boundary.md'
  - '{project-root}/docs/requirements/project-requirements.md'
---

<frozen-after-approval reason="human-approved O4-142 integration slice; do not modify unless human renegotiates">

## Traceability

Jira: O4-142 — Decide and implement a cross-system identity mapping so Keycloak `sub` can resolve to a real `Person.id`.
BMAD owner: Story 1.4, Functional roles and permissions as runtime-editable data.

## Intent

**Problem:** No mapping currently resolves a verified Keycloak subject to the authoritative People
record, so Access Control cannot identify the authenticated administrator.

**Approach:** Add OIDC/Keycloak identity-link persistence and lifecycle commands in People
Service, expose a versioned internal resolver contract, and consume it through Access Control's
existing `IPrincipalPersonResolver` seam.

## Boundaries & Constraints

**Always:**
- Scope is OIDC/Keycloak only. The key is `(canonicalIssuer, opaqueSubject)`.
- People Service owns identity links and never shares its database with Access Control.
- Canonicalize only the issuer: allowlisted issuer, lowercase scheme/host, remove default port and
  one trailing slash, preserve path case, reject query/fragment/userinfo, require HTTPS outside
  local environments.
- Subject is nonblank and preserved exactly; never lowercase, trim, decode, or destructively
  normalize it.
- PostgreSQL enforces one active Person per `(issuer, subject)` and one active subject per
  `(personId, issuer)`. A Person may have active identities under different issuers. Historical
  `REVOKED` rows remain allowed.
- Both `subjectFingerprint` and `requestFingerprint` use `IIdentityFingerprintService`. Keys are
  protected deployment secrets, never hardcoded; records store only a non-secret key version.
  Verification supports current and retained previous key versions. Missing or invalid key
  configuration fails mutations closed. Keys, raw subjects, canonical requests, and fingerprints
  are never logged. Tests use fabricated keys.
- Audit is separate from Access Control's narrow six-category journal. Audit is append-only and
  mutation plus audit plus successful idempotency record commit atomically.
- `personId` is the target selected by a trusted provisioning operation, not actor identity.
  Actor identity comes only from `IIdentityLinkProvisioningAuthorizer`.
- Access Control's future verified JWT pipeline supplies both `iss` and `sub` as
  `OidcPrincipalIdentity { issuer, subject }`; the resolver never accepts a subject alone.
- The O4-142 adapter validates and canonicalizes `issuer` using the same rules as People Service,
  preserves `subject` exactly, and keeps issuer/provider identities isolated.

**Ask First:** None; the approved recommendations below resolve all in-scope decisions.

**Never:**
- No Access Control JWT middleware, trusted service-authentication implementation, functional-role
  authorization, BFF/frontend changes, PeopleForce/TimeTracker support, or deployment recovery.
- No anonymous endpoint, temporary shared secret, caller header, browser-token workaround, or
  caller-supplied actor identity.
- No browser-facing identity-mapping operation may invoke `LinkIdentity`, `RevokeIdentity`,
  `RelinkIdentity`, or `Resolve`, or supply their target PersonId, issuer, subject, or actor identity.
- No raw subject in logs, `ProblemDetails`, audit state, or full provisioning requests.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output | Error |
|---|---|---|---|
| Resolve | Trusted internal caller, one ACTIVE link | `200 { personId }` | N/A |
| Missing/revoked | No ACTIVE link | No identity result | `404` ProblemDetails |
| Corrupt duplicate | Multiple ACTIVE matches | No winner selected | `409` ProblemDetails |
| Unavailable | DB/resolver unavailable | Fail closed | `503` ProblemDetails |
| Invalid trust | Missing/invalid internal-service authorization | No lookup | `401/403` ProblemDetails |
| Concurrent mutation | Same identity or idempotency key races | One committed winner; loser reloads result | Conflict or original result |

## Code Map

- `services/people-service/prisma/schema.prisma` -- add `PersonExternalIdentityLink`,
  `IdentityLinkOperation`, and `IdentityLinkAudit` models, relations, and normal indexes.
- `services/people-service/prisma/migrations/` -- add explicit SQL partial unique indexes and
  duplicate-data preflight.
- `services/people-service/src/modules/identity-mappings/` -- commands, validation, resolver,
  provisioning authorization port, fingerprint abstraction, and internal handler.
- `services/access-control-service/src/AccessControlService.Infrastructure/Identity/` -- replace
  the unavailable resolver with a People adapter; retain `IPrincipalPersonResolver` and update its
  minimal contract from `ResolvePersonAsync(string principalSub, ...)` to
  `ResolvePersonAsync(OidcPrincipalIdentity identity, ...)`.
- `services/access-control-service/src/AccessControlService.Domain/Identity/IPrincipalPersonResolver.cs`
  -- existing consumer contract; add the minimal `OidcPrincipalIdentity` value object containing
  `issuer` and `subject`; do not implement JWT validation here.
- `services/people-service` and Access Control tests -- contract, persistence, authorization,
  concurrency, and fail-closed coverage.
- `libs/contracts/` -- do not add generated TypeScript contracts; document a small versioned
  OpenAPI/JSON contract suitable for the .NET consumer.

## Tasks & Acceptance

**Execution:**
- [ ] Add `PersonExternalIdentityLink`, `IdentityLinkOperation`, and `IdentityLinkAudit` models,
  relations, normal indexes, append-only audit behavior, and all required fields.
- [ ] Add explicit SQL partial unique indexes on ACTIVE `(canonicalIssuer, opaqueSubject)` and
  `(personId, canonicalIssuer)`. Fail upgrades clearly when existing active duplicates violate
  either rule; never select, delete, revoke, merge, or reassign a winner.
- [ ] Implement `LinkIdentityAsync(LinkIdentityRequest, CancellationToken)`, where the request
  contains `personId`, `issuer`, `subject`, and `idempotencyKey`. The target PersonId is trusted
  provisioning input, not actor identity. Authorize first, validate Person/issuer/subject,
  enforce active uniqueness, and atomically persist the link, successful operation, and LINK audit.
- [ ] Implement `RevokeIdentityAsync(RevokeIdentityRequest, CancellationToken)`, where the request
  contains `linkId`, `reason`, and `idempotencyKey`. Authorize first; missing links return 404,
  inactive links are idempotent no-ops, and active links become REVOKED with atomic operation and
  REVOKE audit.
- [ ] Implement atomic `RelinkIdentityAsync(RelinkIdentityRequest, CancellationToken)`, where the
  request contains `existingLinkId`, `newIssuer`, `newSubject`, and `idempotencyKey`. Authorize
  and validate first; a uniqueness conflict or failure rolls back so the old link remains active;
  success atomically creates the new link, revokes the old link, and writes one RELINK audit.
- [ ] Implement `IIdentityFingerprintService` with protected key configuration and key-version
  compatibility; request fingerprints provide durable idempotency and subject fingerprints protect
  audit correlation. Provide a fail-closed production authorization seam and no public provisioning route.
- [ ] Define `POST /api/v1/internal/identity-mappings/resolve` with trusted internal-service
  authorization. Request `{ issuer, subject }` is accepted only from Access Control after its
  verified JWT pipeline extracts `iss` and `sub`; success is exactly `{ personId }`; non-success
  uses `application/problem+json` with 400/401/403/404/409/503 and no raw identity values.
- [ ] Update `IPrincipalPersonResolver` and its adapter to consume `OidcPrincipalIdentity`, validate
  both issuer and subject, and keep production activation blocked until trusted service
  authentication is available; do not add JWT validation here.
- [ ] Add migration, upgrade, contract, adapter, concurrency, provider-isolation, lifecycle,
  fingerprint, and fail-closed tests. Distinguish mocked authentication from real Keycloak proof.

**Acceptance Criteria:**
- Given one valid ACTIVE link and a cryptographically verified internal request, when resolution
  runs, then the authoritative PersonId is returned.
- Given missing, revoked, malformed, ambiguous, duplicate, unavailable, or unauthorized state,
  when resolution or mutation runs, then the defined ProblemDetails result is returned and no
  unauthorized mutation, operation, or audit is written.
- Given a link request, when authorization, validation, target lookup, or fingerprint setup fails,
  then no link, operation, or mutation audit is written.
- Given a revoke request for an active link, when it succeeds, then the link is retained as REVOKED
  and the mutation, operation, and audit commit atomically; an inactive link is an idempotent no-op.
- Given a relink request, when the new identity conflicts or cannot be created, then the old link
  remains ACTIVE; when it succeeds, old revoke and new link commit atomically.
- Given concurrent link or idempotency-key requests, when PostgreSQL resolves the race, then one
  transaction commits; the loser reloads the committed operation in a fresh context and returns
  the original result only for an equivalent request, otherwise `409`.
- Given any audit record, when it is persisted, then it is append-only, atomic with the mutation,
  contains only permitted state, and contains no raw subject, JWT, HMAC key, canonical request,
  or full provisioning request.
- Given an unavailable provisioning authorizer or fingerprint key, when a mutation is attempted,
  then it fails closed without identity, operation, or mutation-audit writes.
- Given a browser request, when it reaches the platform, then it cannot invoke these commands or
  supply their target issuer, subject, PersonId, or actor identity.

## Design Notes

`PersonExternalIdentityLink` has `id UUID`, required `personId` FK to `Person`, `canonicalIssuer`,
`opaqueSubject`, `status ACTIVE|REVOKED`, `linkedAtUtc`, nullable `revokedAtUtc`, nullable
`revocationReason`, `createdAtUtc`, and `updatedAtUtc`. It has a Person relation, an index on
`personId`, and status/issuer lookup indexes. PostgreSQL partial unique indexes enforce active
`(canonicalIssuer, opaqueSubject)` and active `(personId, canonicalIssuer)`; multiple REVOKED
historical rows remain allowed.

`IdentityLinkOperation` has `operationId UUID`, `operationType LINK|REVOKE|RELINK`,
`idempotencyKey`, `requestFingerprint`, `fingerprintKeyVersion`, nullable `resultLinkId`,
`resultStatus`, and `createdAtUtc`. It has a unique `(operationType, idempotencyKey)` constraint
and an index on `resultLinkId`.

`IdentityLinkAudit` has `auditId UUID`, `action LINK|REVOKE|RELINK`, nullable `linkId`, `personId`,
`canonicalIssuer`, `subjectFingerprint`, `fingerprintKeyVersion`, `actorType`,
`actorIdentifier`, `correlationId`, `idempotencyKey`, `beforeState JSON`, `afterState JSON`, and
`occurredAtUtc`. It is append-only, indexed by `(personId, occurredAtUtc)`, and separate from
Access Control's narrow six-category journal.

`IIdentityFingerprintService` computes keyed HMAC values for subjects and canonical requests.
Keys come only from protected deployment configuration/secret storage, are never hardcoded or
logged, and records store only a non-secret key version. Current and retained previous keys must
verify replay requests where compatibility is required. Audit state may contain only link ID,
PersonId, canonical issuer, status, timestamps, and permitted non-sensitive reason; RELINK also
contains old/new link IDs and protected fingerprints. Raw subjects are stored exactly only in the
primary link table for lookup, never in audit JSON, logs, or ProblemDetails.

Idempotency is durable: successful mutation, operation, and audit commit atomically. A replay
with the same key and equivalent request returns the original result; a different request returns
409. After losing a unique-key race, the failed transaction rolls back and the committed
operation is reloaded in a fresh transaction/context. Failed authorization or validation creates
no operation record. No in-memory idempotency mechanism is permitted.

The endpoint is a contract and fail-closed seam, not an invitation to expose unauthenticated HTTP.
Its exact contract is `POST /api/v1/internal/identity-mappings/resolve` with request
`{ issuer, subject }` and success `{ personId }`. The request is accepted only from an authenticated
internal Access Control caller after the verified JWT pipeline supplies `iss` and `sub`; it is not
a browser-facing request. Issuer validation/canonicalization is identical in both services and
correlation IDs propagate. Responses use `application/problem+json`: 400 malformed issuer/subject,
401 missing/invalid service authentication, 403 unauthorized service, 404 missing/revoked mapping,
409 corrupt duplicate, and 503 persistence/adapter unavailable. Responses and logs contain no raw
subject, token, key, canonical request, or fingerprint.

Production Access Control-to-People activation and live cross-service E2E remain external blockers
owned by the separate trusted-service/JWT work. Migration verification runs only against disposable
PostgreSQL/Testcontainers databases; existing active duplicates fail clearly before mutation.

## Verification

- `cd services/people-service && npm run build` -- expected: success.
- `cd services/people-service && npm test` -- expected: unit and contract tests pass.
- `cd services/people-service && npm run db:deploy` -- this existing package script may be used
  only against disposable clean and upgrade PostgreSQL/Testcontainers databases; never apply it
  to the developer's persistent local database. Expected: migrations apply; duplicate active data
  fails without mutation.
- Access Control adapter tests -- expected: resolved, missing, ambiguous, unavailable, and invalid
  trusted identity outcomes fail closed for both issuer and subject.
- Live Keycloak/browser and production-like cross-service verification are external follow-ups
  after trusted service authentication and Access Control JWT validation exist; they are not
  independent O4-142 completion checks and mocked principals must remain clearly separated.

</frozen-after-approval>
