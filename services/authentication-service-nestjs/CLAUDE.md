# Authentication service (NestJS backup — not the live service)

**This directory is a reference backup, not an active service.** It was built by mistake during
Story 1.11 (the spec incorrectly assumed NestJS by pattern-matching `people-service`'s scaffold),
before discovering that `services/authentication-service` was already documented as **.NET** in
four independent places (root `CLAUDE.md`, `libs/config/README.md`,
`.claude/agents/identity-access-engineer.md`, and `all-services-artifacts.yml`'s CI matrix pairing
it with `access-control-service`). The real implementation lives at
`services/authentication-service` (.NET). Kept here only as a working reference for the realm
provisioning approach and integration-test pattern — not wired into CI, not deployed, safe to
delete once the .NET version supersedes it.

---

Owns Keycloak realm/client provisioning (infra-as-code, versioned alongside this service) and
gives downstream services one canonical HTTP endpoint to learn the realm's issuer/JWKS location.
It is a thin façade, not an OIDC proxy and not a policy engine — authorization decisions
(access-role resolution, functional permissions, section/record/operation policy) belong to
`services/access-control-service` (.NET), never here. The interactive login flow (browser →
Keycloak authorization-code redirect, BFF-initiated) and per-request JWT validation are later
slices — see `_bmad-output/implementation-artifacts/deferred-work.md`.

## Tech Stack

- **Framework**: NestJS 11 (Express, CommonJS), TypeScript full strict
- **Identity provider**: Keycloak, via `infra/docker-compose.yml` (dev-mode `start-dev
  --import-realm`, this service's own `keycloak/realm-export.json` mounted in) — this service is
  stateless; Keycloak is the identity store, no database of its own
- **Config**: `@nestjs/config` + Joi env validation
- **Validation**: global `ValidationPipe` (whitelist, transform) + class-validator
- **Docs**: Swagger at `/api/docs`; health via `@nestjs/terminus` + `HttpHealthIndicator` at
  `/api/v1/health` — pings the realm's own `/.well-known/openid-configuration`, proving both
  "Keycloak is up" and "our realm actually exists" in one check
- **Tests**: Jest — unit specs in `src/modules/*/__tests__/`; a real-Keycloak Testcontainers
  integration spec in `test/keycloak.integration.spec.ts` (Docker required locally)
- Lint/tsconfig/jest bases are shared via `libs/config/` (see `libs/config/README.md`) — this
  service's `eslint.config.mjs`, `tsconfig.json`, and `package.json`'s `"jest"`/`"prettier"`
  fields just point at them plus whatever is service-specific.

## Commands

- `nvm use` — REQUIRED first: project needs Node 22 (`.nvmrc`)
- `npm install` — also run `npm install` inside `libs/config/` once (shared ESLint deps live
  there); this service does not depend on `libs/contracts`
- `npm run start:dev` — dev server with watch (port 3008); needs Keycloak reachable at
  `KEYCLOAK_BASE_URL` (`infra/docker-compose.yml` brings it up)
- `npm run build` / `npm run lint` — build / ESLint
- `npm test` — runs unit specs **and** the Testcontainers Keycloak integration spec together
  (Docker required locally; the integration spec boots a real, throwaway Keycloak container per
  run, so first run pulls the pinned image)

## Project Structure (`src/`)

- `main.ts` — bootstrap: `/api` prefix, URI versioning `/v1`, CORS, global pipe, Swagger
- `app.module.ts` — root module: imports only, no controllers/services
- `config/` — infrastructure: Joi env validation schema
- `modules/health/` — `GET /api/v1/health`, Keycloak discovery-endpoint ping
- `modules/auth-config/` — `GET /api/v1/auth/config`, resolves `{ issuer, jwksUri, realm }` from
  this service's own env config (never a synchronous call to Keycloak's admin API)

## Keycloak realm provisioning (`keycloak/`)

- `realm-export.json` is the single source of truth for the `people-management` realm, the
  `bff-confidential` client, and one seeded test user — applied via Keycloak's own
  `--import-realm` startup flag, never hand-rolled Admin REST API provisioning code
- `bff-confidential` has `directAccessGrantsEnabled: true` **for this story's integration test
  only** — the real login flow is authorization-code, BFF-initiated, and is a separate,
  not-yet-built slice
- Editing the realm/client/test-user shape means editing this file directly (it's what
  `infra/docker-compose.yml`'s `keycloak` service and `test/keycloak.integration.spec.ts` both
  mount/reference) — there is no separate "apply" step

## Code Style (universal)

- TypeScript full strict is ON — declare DTO/entity fields with `!` (they are instantiated by
  ValidationPipe/serialization, not constructors)
- All code comments in English
- Routes are versioned automatically: controllers get `/api/v1/...` from main.ts — never hardcode
  the prefix
- No `process.env` in application code — only via `ConfigService.getOrThrow<T>('KEY')`

## Environment

- App port **3008**; CORS is open for `http://localhost:4200` (the React frontend, via the BFF in
  practice — this service is not meant to be called directly from the browser)
- `KEYCLOAK_BASE_URL`/`KEYCLOAK_REALM` point at the Keycloak server this service's own
  `keycloak/realm-export.json` provisions — see `.env.example`
- `.env` is gitignored; `.env.example` is the committed template

## Gotchas

- **Node 22 only** — matches every other Node service in this monorepo
- The integration spec starts a real Keycloak container per run (`testcontainers`, base package
  — not `@testcontainers/postgresql`) and waits on its "Listening on:" startup log line; expect
  the first local run to take longer while the image pulls
- `KEYCLOAK_BASE_URL` must have no trailing slash and no `/realms/...` suffix — both the health
  check and `GET /api/v1/auth/config` append `/realms/{KEYCLOAK_REALM}/...` themselves
