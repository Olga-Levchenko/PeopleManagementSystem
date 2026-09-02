# BFF (Browser boundary / API gateway)

The browser-facing composition boundary — not a domain owner. Per
[ARCHITECTURE-SPINE AD-5](../../_bmad-output/planning-artifacts/architecture/architecture-PeopleManagementSystem-2026-08-25/ARCHITECTURE-SPINE.md):
React talks only to this service. It validates Keycloak-issued authentication, adds correlation
context, calls and composes the domain services' APIs, and returns consistent errors. It must
**not** own authorization policy or bypass the Authorization Service, and it has **no persistence
of its own** — restricted sections/fields are omitted server-side by the domain services before
reaching this layer, and this layer must not reintroduce them. Per-area conventions live in
`.claude/rules/` and load automatically when working with matching files.

## Tech Stack

- **Framework**: NestJS 11 (Express, CommonJS), TypeScript full strict
- **Config**: `@nestjs/config` + Joi env validation
- **AuthN**: global `passport-jwt` guard (`modules/auth/`) validates every request's bearer token
  against Keycloak's real JWKS (via `jwks-rsa`) and issuer/audience, before any controller runs —
  see Gotchas for the `@Public()` opt-out and what `request.user` does/doesn't carry
- **Validation**: global `ValidationPipe` (whitelist, transform) + class-validator
- **Docs**: Swagger at `/api/docs`; health via `@nestjs/terminus` at `/api/v1/health`
- **Tests**: Jest — unit in `src/modules/*/__tests__/`, e2e in `test/` (`test/jwt-guard.e2e-spec.ts`
  boots a real, ephemeral Keycloak via Testcontainers — Docker required)
- Lint/tsconfig/jest bases are shared via `libs/config/` (see `libs/config/README.md`) — this
  service's `eslint.config.mjs`, `tsconfig.json`, and `package.json`'s `"jest"`/`"prettier"` fields
  just point at them plus whatever is service-specific.

## Commands

- `nvm use` — REQUIRED first: project needs Node 22 (`.nvmrc`)
- `npm install` — and once, `npm install` inside `libs/config/` too (shared ESLint deps live there)
- `npm run start:dev` — dev server with watch (port 3001)
- `npm run build` / `npm run lint` — build / ESLint
- `npm test` / `npm run test:e2e` — unit / e2e

## Project Structure (`src/`)

- `main.ts` — bootstrap: `/api` prefix, URI versioning `/v1`, CORS, global pipe, Swagger
- `app.module.ts` — root module: imports only, no controllers/services
- `config/` — infrastructure: Joi env validation schema
- `modules/` — feature modules, one folder per feature; seeded modules today are `modules/health`,
  `modules/organisational-relationships`, and `modules/auth` (the global JWT guard — `jwt.strategy.ts`,
  `jwt-auth.guard.ts`, `public.decorator.ts`, `auth.module.ts`) — add further feature modules under
  `modules/<name>`

There is deliberately no `prisma/` or `src/prisma/` here — this service does not own a database.

## Code Style (universal)

- TypeScript full strict is ON — declare DTO/entity fields with `!` (they are instantiated by
  ValidationPipe/serialization, not constructors)
- All code comments in English
- Routes are versioned automatically: controllers get `/api/v1/...` from main.ts — never hardcode
  the prefix

## Environment

- App port **3001**; CORS is open for `http://localhost:4200` (the React frontend)
- `.env` is gitignored; `.env.example` is the committed template
- Required at startup, fail-fast if missing (no Joi `.default(...)` — a real deployment must not
  silently fall back to a localhost value that can never match a real Keycloak issuer):
  `KEYCLOAK_BASE_URL`, `KEYCLOAK_REALM` (letters/digits/`-`/`_` only — same restriction as
  `authentication-service`'s `AppConfig.ValidateRealmName`) — the same two values
  `authentication-service`'s `AppConfig` reads; `JwtStrategy` derives its own issuer/JWKS URI from
  them independently (see Gotchas), never via a live call to `authentication-service`.
  **`KEYCLOAK_REALM` must exactly match the realm `authentication-service` actually has
  provisioned** (`people-management` in every environment today) — this value is never fetched
  live from `authentication-service`, so a typo here doesn't fail fast with a clear error; it
  silently derives a wrong issuer/JWKS URI, and every real token then fails validation with a
  generic JWKS-fetch/401 failure that looks like a Keycloak outage, not a config typo

## Gotchas

- **Node 22 only**
- Jest scripts carry `NODE_OPTIONS=--experimental-vm-modules` — required by the shared Jest
  preset's toolchain, do not remove
- Import supertest as default: `import request from 'supertest'` (esModuleInterop; namespace
  import is not callable)
- **Every route is authenticated by default (AD-5)** — `JwtAuthGuard` is registered globally as
  `APP_GUARD` in `app.module.ts`. A route opts OUT via `@Public()` (`modules/auth/public.decorator.ts`),
  never the other way around; only `/health` uses it today. `request.user` is always exactly
  `{ sub }` — no role/permission claim is ever read from the token (access roles/functional-role
  permissions are resolved by `access-control-service`, never sourced from Keycloak claims).
- **`JwtStrategy` validates signature (real JWKS via `jwks-rsa`), issuer, audience
  (`bff-confidential`), and algorithm (`RS256`) — with a 5s `clockTolerance`** for real clock drift
  across machines/containers. The `bff-confidential` client's `aud` claim only contains
  `bff-confidential` because of the `bff-confidential-audience` protocol mapper baked into
  `authentication-service/keycloak/realm-export.json` — without it, Keycloak's default `aud` would
  not satisfy this audience check.
- `@nestjs/passport` and `jwks-rsa` are pinned below their latest majors (`^11.0.5` and `^3.2.2`
  respectively, not `^12.x`/`^4.x`) — both latest majors ship ESM-only dependencies
  (`@nestjs/passport@12` itself; `jwks-rsa@4`'s `jose@^6`) that this service's CommonJS Jest setup
  cannot `require()` on Node 24.7 (`Jest's require(ESM) requires Node v24.9+`). Do not bump either
  without first confirming Jest can still load them.
- `test/jwt-guard.e2e-spec.ts` overrides `ConfigService` directly on the compiled testing module
  (not `process.env`) to inject the ephemeral Testcontainers-Keycloak's real
  `KEYCLOAK_BASE_URL`/mapped port — `ConfigModule.forRoot()` reads `process.env` synchronously the
  moment `AppModule` is first imported, before any test's own `beforeAll` runs, so setting
  `process.env` there is too late. `test/jest-e2e-setup.ts` (wired via `jest-e2e.json`'s
  `setupFiles`) supplies placeholder `KEYCLOAK_BASE_URL`/`KEYCLOAK_REALM` values purely so
  `AppModule` can be imported at all in e2e tests that don't need a real Keycloak (e.g.
  `app.e2e-spec.ts`) — production/local-dev must still set real values, per Joi's `.required()`.
