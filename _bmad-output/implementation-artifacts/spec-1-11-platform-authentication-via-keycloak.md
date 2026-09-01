---
title: 'Story 1.11: Platform authentication via Keycloak'
type: 'feature'
created: '2026-09-01'
status: 'in-progress'
review_loop_iteration: 1
baseline_commit: 'e9d4229f75077f6735abe2575a93f9282912241f'
context:
  - '{project-root}/docs/decisions/'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `services/authentication-service/` is an empty scaffold and Keycloak in
`infra/docker-compose.yml` is an unpinned placeholder with no realm/client — nothing in this
platform can issue or verify a real identity yet, and every downstream fail-closed stub (Story
1.3's `RequestActorContext`, Story 1.9's unauthenticated endpoint) is waiting on it.

**Approach:** Scaffold `authentication-service` as a .NET/ASP.NET Core service matching
`access-control-service`'s conventions (its documented sibling .NET service — see Spec Change
Log), own a realm-export config that provisions a real, pinned local Keycloak realm/client via
Keycloak's native `--import-realm` startup mechanism, and expose one endpoint
(`GET /api/v1/auth/config`) that gives downstream services the issuer/JWKS info needed to validate
tokens — proven by an integration test that runs a real Keycloak container (Testcontainers) and
performs a direct-grant login. BFF JWT validation and downstream identity propagation are Story
1.11's remaining slices (`deferred-work.md`), out of scope here.

## Boundaries & Constraints

**Always:**
- Realm/client config lives under `services/authentication-service/` (already noted as this
  service's ownership boundary in `infra/docker-compose.yml`'s existing comment), applied via
  Keycloak's own `--import-realm` flag — never hand-rolled Admin REST API provisioning code.
- The test client has `directAccessGrantsEnabled: true` *for testing only* (proves token issuance
  without a browser); the real login flow (authorization-code, BFF-initiated) is explicitly out of
  scope here — that's the next slice.
- Match `access-control-service`'s ASP.NET Core conventions: `AppConfig`-style fail-fast env
  validation, `CorrelationIdMiddleware`, health check via `AspNetCore.HealthChecks.*` at
  `/api/v1/health`, Swagger (Development only), explicit `/api/v1/...` route versioning,
  `global.json` pinning the SDK to `8.0.x`. No `libs/config`/`libs/contracts` — those are Node-only
  (per their own READMEs), same exclusion `access-control-service` already has.
- Health check pings the realm's own `/.well-known/openid-configuration` (a custom
  `IHealthCheck`, or `AddUrlGroup`) — proves both "Keycloak is up" and "our realm actually exists"
  in one check, not just a bare TCP ping.
- Pin the Keycloak image tag actually used and remove the "must be verified and pinned" placeholder
  comment in `infra/docker-compose.yml` once this story exercises it in a real test.

**Ask First:** None anticipated — this is new, additive infrastructure with no existing consumer.

**Never:**
- No BFF changes, no JWT-validation middleware, no propagation to domain services — deferred
  (`deferred-work.md`, target specs `spec-1-11b-*`/`spec-1-11c-*`).
- No production TLS/secret-management story — dev-mode Keycloak (`start-dev`), same posture as
  every other local-only piece of infra in this repo today.
- No new database for `authentication-service` — it is stateless; Keycloak is the identity store.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Realm/client provisioned | Keycloak container starts with the realm-export file mounted | The configured realm, client, and one seeded test user exist without any manual Admin Console step | N/A |
| Token issuance | Direct-grant (`password`) login against the test client/user | Keycloak returns a well-formed JWT with the expected issuer and a non-expired `exp` claim | N/A |
| Discovery endpoint | `GET /api/v1/auth/config` while Keycloak is reachable | `200` with `{ issuer, jwksUri, realm }` resolved from this service's own config, matching Keycloak's real discovery document | N/A |
| Keycloak unreachable | `GET /api/v1/health` while Keycloak is down/unstarted | Health check reports unhealthy for the `keycloak` indicator; the service itself still boots (same "boots fine when a dependency is down" contract as every other service's health check) | N/A |

</frozen-after-approval>

## Code Map

- `services/access-control-service/` — the ASP.NET Core scaffold pattern to mirror
  (`src/AccessControlService.Api/Program.cs`, `Configuration/AppConfig.cs`,
  `Middleware/CorrelationIdMiddleware.cs`, `Health/HealthCheckResponseWriter.cs`, `CLAUDE.md`,
  `global.json`, `.github/workflows/access-control-service-ci.yml`) — read-only reference, do not
  modify. Unlike it, this service needs no `AccessControlDbContext`/EF Core/Postgres — it is
  stateless, so skip the Domain/Infrastructure project split entirely; a single
  `AuthenticationService.Api` project (plus its test project) is enough for this thin façade.
- `services/authentication-service/` — currently only `.gitkeep` (+ `keycloak/realm-export.json`
  from this same story's earlier groundwork); scaffold the full service here
- `services/authentication-service-nestjs/` — a reference-only backup from an earlier, incorrect
  NestJS attempt at this same spec (see Spec Change Log) — not live, not wired into CI, may be
  useful for the realm-export.json shape and integration-test approach, but do not copy its code
  structure (wrong stack for this service)
- `services/authentication-service/keycloak/realm-export.json` — already created: realm
  `people-management`, one confidential client (`bff-confidential`,
  `directAccessGrantsEnabled: true` for this story's test only, standard flow enabled for the
  future BFF redirect flow), one seeded test user — reuse as-is, do not recreate
- `infra/docker-compose.yml` — already updated: Keycloak mounts the realm-export file into
  `/opt/keycloak/data/import/`, `--import-realm` added to `start-dev`, version pinned — no changes
  needed here, just confirm it still resolves against the new project's directory structure
- `.github/workflows/access-control-service-ci.yml` — pattern to copy for
  `authentication-service-ci.yml` (`_reusable-dotnet-ci.yml`, different `service_path`) — this
  restores the ALREADY-CORRECT wiring in `all-services-artifacts.yml`'s dotnet matrix, which
  already lists `services/authentication-service` — do not re-add it there

## Tasks & Acceptance

**Execution:**
- [ ] `services/authentication-service/src/AuthenticationService.Api/` — scaffold the ASP.NET Core
  service (`.csproj`, `Program.cs`, `Configuration/AppConfig.cs`,
  `Middleware/CorrelationIdMiddleware.cs`, health check, Swagger) — mirrors
  `access-control-service`'s Api project, no Domain/Infrastructure split needed
- [ ] `services/authentication-service/AuthenticationService.sln` — solution file at the service
  root (CI-glob-compatible, matching `access-control-service`'s convention)
- [ ] `services/authentication-service/global.json` — pin SDK to `8.0.x`
- [ ] `services/authentication-service/src/AuthenticationService.Api/Controllers/` —
  `GET /api/v1/auth/config` endpoint resolving `{issuer, jwksUri, realm}` from `AppConfig`
- [ ] `services/authentication-service/src/AuthenticationService.Api/Health/` — health check
  pinging the realm's OIDC discovery endpoint
- [ ] `services/authentication-service/tests/AuthenticationService.Api.Tests/` — integration test:
  boot a real Keycloak (Testcontainers, `keycloak/realm-export.json` mounted), perform a
  direct-grant login, assert a valid JWT; assert `GET /api/v1/auth/config` matches Keycloak's real
  discovery document
- [ ] `.github/workflows/authentication-service-ci.yml` — point at `_reusable-dotnet-ci.yml`,
  matching `access-control-service-ci.yml` (confirm `all-services-artifacts.yml`'s dotnet matrix
  already lists this service — it does, no edit needed there)
- [ ] `services/authentication-service/CLAUDE.md` — document the service per existing convention
- [ ] `services/authentication-service/.env.example` — `PORT=3008`, `CORS_ORIGIN`,
  `ConnectionStrings:Postgres` is NOT needed (stateless); `KEYCLOAK_BASE_URL`, `KEYCLOAK_REALM`

**Acceptance Criteria:**
- Given the platform's Keycloak container starts with this story's realm-export mounted, when it
  finishes starting, then the configured realm/client/test user exist with no manual step
- Given a direct-grant login against the test client using the seeded test user's credentials,
  when the request completes, then Keycloak returns a valid, well-formed JWT
- Given `authentication-service` is running with Keycloak reachable, when a client calls
  `GET /api/v1/auth/config`, then the response's `issuer`/`jwksUri` match Keycloak's own discovery
  document for the configured realm

## Design Notes

`authentication-service` is a thin façade, not an OIDC proxy: it owns realm/client provisioning
(infra-as-code, versioned alongside the code that depends on it) and gives downstream services one
canonical place to learn the realm's issuer/JWKS location, rather than each service hardcoding
Keycloak's internal URL/realm name. The actual interactive login (browser → Keycloak
authorization-code flow, BFF-initiated) and per-request JWT validation are the next two slices —
this story only proves the realm and token issuance are real and reachable.

For the Testcontainers-based integration test, check whether an official `Testcontainers.Keycloak`
NuGet package resolves; if not, fall back to Testcontainers' generic container builder (the same
library already proven in this repo via `Testcontainers.PostgreSql`/`Testcontainers.RabbitMq` in
`access-control-service`), running `quay.io/keycloak/keycloak:26.0` with `start-dev --import-realm`
and the realm-export file mounted, waiting on the HTTP port.

## Spec Change Log

- **Finding:** The first implementation pass (2026-09-01) scaffolded this service in NestJS,
  pattern-matching `people-service`'s conventions without checking prior architecture intent.
  Human review caught that four independent, pre-existing records — root `CLAUDE.md`
  (`services/authentication-service (.NET + Keycloak)`), `libs/config/README.md` (`not used by
  authentication-service (.NET)`), `.claude/agents/identity-access-engineer.md` (twice), and
  `all-services-artifacts.yml`'s CI matrix (already pairing `authentication-service` with
  `access-control-service` on `_reusable-dotnet-ci.yml`) — all agree this service is .NET. No ADR
  ever recorded a switch away from that.
- **Amended:** Intent/Approach and the "Always" boundary now specify ASP.NET Core matching
  `access-control-service`'s conventions, not NestJS/`people-service`. Code Map, Tasks, and
  Verification below were rewritten for the .NET toolchain.
- **Known-bad state avoided:** Shipping a second Node service where the architecture, CI matrix,
  and a dedicated subagent (`identity-access-engineer`) all already expected .NET — which would
  have silently forked the platform's tech-stack story with no decision record.
- **KEEP:** The realm design itself (`keycloak/realm-export.json`: realm `people-management`,
  confidential client `bff-confidential`, direct-grant test user, `--import-realm` provisioning via
  `infra/docker-compose.yml`) is stack-agnostic and correct as already built — reuse verbatim, do
  not redesign. The NestJS attempt is preserved at `services/authentication-service-nestjs/` as a
  non-live reference for the integration-test approach only.

## Verification

**Commands:**
- `cd services/authentication-service && dotnet build --configuration Release` — expected: builds clean, matches CI
- `cd services/authentication-service && dotnet test --configuration Release` — expected: all tests pass, including the Testcontainers-Keycloak integration test (Docker required locally)
