# Authentication service

The identity provider integration for the People Management Platform: owns Keycloak realm/client
provisioning (infra-as-code, versioned alongside this service) and gives downstream services one
canonical HTTP endpoint to learn the realm's issuer/JWKS location, rather than each service
hardcoding Keycloak's internal URL/realm name. It is a thin façade, not an OIDC proxy and not a
policy engine — authorization decisions (access-role resolution, functional-role permissions,
section/record/operation policy) belong to `services/access-control-service` (.NET), never here.
This service never issues or validates tokens on anyone else's behalf.

Story 1.11 scaffolded this service as ASP.NET Core (matching `access-control-service`'s
conventions), added the realm-export-based Keycloak provisioning
(`keycloak/realm-export.json`, applied via Keycloak's own `--import-realm` startup flag — never
hand-rolled Admin REST API provisioning code), and exposed `GET /api/v1/auth/config`. An earlier
implementation pass mistakenly scaffolded this service in NestJS, pattern-matching
`people-service`; that attempt is preserved, non-live, at
`services/authentication-service-nestjs/` for its realm-provisioning/integration-test approach
only — see `_bmad-output/implementation-artifacts/spec-1-11-platform-authentication-via-keycloak.md`'s
Spec Change Log. The real login flow (browser → Keycloak authorization-code redirect,
BFF-initiated), BFF JWT validation, and downstream identity propagation are later slices — see
`_bmad-output/implementation-artifacts/deferred-work.md` (target specs
`spec-1-11b-bff-jwt-validation.md` / `spec-1-11c-verified-identity-propagation.md`).

## Tech Stack

- **Framework**: ASP.NET Core 8 Web API (controllers, not minimal-API-only)
- **Identity provider**: Keycloak, via `infra/docker-compose.yml` (dev-mode `start-dev
  --import-realm`, this service's own `keycloak/realm-export.json` mounted in) — this service is
  stateless; Keycloak is the identity store, no database/EF Core, no Domain/Infrastructure project
  split (unlike `access-control-service` — a single `AuthenticationService.Api` project is enough)
- **Config**: `Microsoft.Extensions.Configuration` (appsettings + environment variables) +
  `DotNetEnv` for local `.env` loading, with explicit fail-fast validation in
  `Configuration/AppConfig.cs` (see Gotchas) — same pattern as `access-control-service`
- **Health checks**: `AspNetCore.HealthChecks.Uris` at `/api/v1/health`, pinging this realm's own
  `/.well-known/openid-configuration` (proves both "Keycloak is up" and "our realm actually
  exists" in one check), JSON body via a custom `HealthCheckResponseWriter`
- **Docs**: Swagger/OpenAPI via `Swashbuckle.AspNetCore`, Development environment only
- **Tests**: xUnit, all in `tests/AuthenticationService.Api.Tests/` (no separate Domain/
  Infrastructure test projects, matching the single-project Api split):
  - `AppConfigTests.cs` — fail-fast config validation, unit-level, no host
  - `HealthEndpointTests.cs` — `WebApplicationFactory<Program>` pipeline tests: correlation-id
    echo/generate, CORS, and the "Keycloak unreachable" edge case (health check reports the
    `keycloak` indicator unhealthy while the service itself still boots and answers)
  - `AuthConfigControllerTests.cs` — `GET /api/v1/auth/config` resolves purely from `AppConfig`,
    with no real Keycloak required
  - `KeycloakIntegrationTests.cs` — the story's real, Testcontainers-based (`Testcontainers.Keycloak`,
    the official NuGet package resolves) end-to-end proof: boots a real, ephemeral Keycloak with
    `keycloak/realm-export.json` imported, performs a direct-grant login against the seeded test
    user and asserts a well-formed, non-expired JWT, and asserts `GET /api/v1/auth/config` matches
    Keycloak's own discovery document. Shares one container across its `[Fact]`s via
    `KeycloakFixture`, an `ICollectionFixture` registered on the `HealthEndpointTests` collection.
    Requires Docker locally/in CI.

## Commands

- `dotnet build --configuration Release` — build (matches CI)
- `dotnet test --configuration Release` — unit + integration tests, Release configuration (matches
  CI; `KeycloakIntegrationTests` needs Docker running locally to start its ephemeral Keycloak
  container, and pulls `quay.io/keycloak/keycloak:26.0` on first run)
- `dotnet run --project src/AuthenticationService.Api` — run locally (needs Keycloak up via
  `infra/docker-compose.yml` and a local `.env`, see Environment)

## Project Structure

- `AuthenticationService.sln` — solution file at the service root (CI-glob-compatible)
- `keycloak/realm-export.json` — the single source of truth for the `people-management` realm, the
  `bff-confidential` client, and one seeded test user — applied via Keycloak's own `--import-realm`
  startup flag. `bff-confidential` has `directAccessGrantsEnabled: true` **for this story's
  integration test only**; `standardFlowEnabled` is on for the future BFF-initiated
  authorization-code redirect flow, not yet built. Also mounted by `infra/docker-compose.yml`'s
  `keycloak` service for local dev, and copied into the test project's output directory (see that
  project's `.csproj`) for `KeycloakIntegrationTests`.
- `src/AuthenticationService.Api/Program.cs` — bootstrap: config validation, CORS, correlation-id
  middleware, the `keycloak` health check, controllers
- `src/AuthenticationService.Api/Controllers/AuthConfigController.cs` —
  `GET /api/v1/auth/config`, resolving `{issuer, jwksUri, realm}` from `AppConfig` alone (never a
  synchronous call to Keycloak's admin API — this endpoint stays reachable even if Keycloak itself
  is briefly down, unlike the `/api/v1/health` `keycloak` check, which does ping Keycloak)
- `src/AuthenticationService.Api/Configuration/AppConfig.cs` — fail-fast startup config validation
  (`PORT`, `CORS_ORIGIN`, `KEYCLOAK_BASE_URL`, `KEYCLOAK_REALM`) plus the derived `Issuer`/
  `JwksUri`/`DiscoveryDocumentUri` properties every other component reads from
- `src/AuthenticationService.Api/Middleware/CorrelationIdMiddleware.cs` — `x-correlation-id`
  propagation, identical to `access-control-service`'s
- `src/AuthenticationService.Api/Health/HealthCheckResponseWriter.cs` — health-check JSON shape
  (`status`/`checks`/`totalDurationMs`), identical to `access-control-service`'s
- `tests/AuthenticationService.Api.Tests/` — see Tech Stack above for what each file covers

## Code Style

- All code comments in English
- Nullable reference types are ON (`<Nullable>enable</Nullable>`) — do not suppress with `!` where
  a real null check is possible
- No `process.env`-equivalent (`Environment.GetEnvironmentVariable`) in application code outside
  `Program.cs`'s own bootstrap and test setup — everything else reads through
  `IConfiguration`/`AppConfig`
- Routes are explicitly versioned (`/api/v1/...`) — there is no automatic URI-versioning
  convention in ASP.NET Core the way NestJS provides it

## Environment

- App port **3008** (`PORT`); CORS is open for `http://localhost:4200` (the React frontend, via
  the BFF in practice — this service is not meant to be called directly from the browser)
- `.env` is gitignored; `.env.example` is the committed template — loaded via `DotNetEnv` at
  startup, but never overrides a variable already set in the process environment
- Local Keycloak comes from the shared `infra/docker-compose.yml`, not a per-service compose file
- Required at startup, fail-fast if missing/blank: `PORT`, `CORS_ORIGIN`, `KEYCLOAK_BASE_URL`
  (no trailing slash needed — `AppConfig.Load` trims one if present), `KEYCLOAK_REALM`
- No `ConnectionStrings:Postgres` — this service is stateless, unlike `access-control-service`

## Gotchas

- **`global.json` pins the SDK to `8.0.x`** — this machine has multiple .NET SDKs installed;
  without it, `dotnet` commands here would silently pick up a newer SDK than CI's
  `actions/setup-dotnet 8.0.x`.
- **No Dockerfile yet** — same as `access-control-service`: the reusable CI workflow's Docker
  build/save/upload-artifact steps silently no-op for this service (gated on
  `if [ -f Dockerfile ]`) until one is added.
- **`AppConfig` never actually calls Keycloak** — `Issuer`/`JwksUri`/`DiscoveryDocumentUri` are
  pure string derivations from `KEYCLOAK_BASE_URL`/`KEYCLOAK_REALM`. `GET /api/v1/auth/config`'s
  acceptance criterion ("matches Keycloak's real discovery document") holds because both this
  service and the real Keycloak realm are provisioned from the same values
  (`keycloak/realm-export.json`'s `realm` field, and whatever `KEYCLOAK_BASE_URL`/
  `KEYCLOAK_REALM` are set to at deploy time) — not because this endpoint queries Keycloak
  directly. Only the `keycloak` health check makes a real network call.
- **`KeycloakIntegrationTests` shares one container across its `[Fact]`s** via `KeycloakFixture`
  (an `ICollectionFixture<KeycloakFixture>` registered on the `HealthEndpointTests` collection
  definition in `HealthEndpointTests.cs`) — starting a fresh Keycloak container per fact would
  multiply an already-slow (multi-second) container boot by the number of facts. Every test class
  that spins up a real `WebApplicationFactory<Program>` (or the `KeycloakFixture` container) joins
  this same collection, since `DisableParallelization = true` is the only thing preventing two test
  classes from racing on the same process-wide `PORT`/`CORS_ORIGIN`/`KEYCLOAK_BASE_URL`/
  `KEYCLOAK_REALM` environment variables `AppConfig.Load` reads before
  `WebApplicationFactory`'s own config-override hooks apply.
- **BFF JWT validation, per-request identity propagation to domain services, and the real
  interactive login flow are explicitly out of scope for Story 1.11** — this service only proves
  the realm and token issuance are real and reachable. See `deferred-work.md`.
