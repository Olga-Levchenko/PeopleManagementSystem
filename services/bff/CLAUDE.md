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
- **Validation**: global `ValidationPipe` (whitelist, transform) + class-validator
- **Docs**: Swagger at `/api/docs`; health via `@nestjs/terminus` at `/api/v1/health`
- **Tests**: Jest — unit in `src/modules/*/__tests__/`, e2e in `test/`
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
- `modules/` — feature modules, one folder per feature; `modules/health` is the only seeded
  module — add feature modules under `modules/<name>`

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

## Gotchas

- **Node 22 only**
- Jest scripts carry `NODE_OPTIONS=--experimental-vm-modules` — required by the shared Jest
  preset's toolchain, do not remove
- Import supertest as default: `import request from 'supertest'` (esModuleInterop; namespace
  import is not callable)
