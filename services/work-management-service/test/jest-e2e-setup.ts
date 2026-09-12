import { config } from 'dotenv';
import path from 'path';

// Load the service's local `.env` before placeholders so Prisma-backed suites (management-notes,
// action-items) keep the real docker-compose DATABASE_URL. `ConfigModule.forRoot()` does not
// override variables already present in `process.env`.
config({ path: path.resolve(__dirname, '../.env') });

// Runs before each e2e test file's own imports. `env.validation.ts` makes KEYCLOAK_BASE_URL,
// KEYCLOAK_REALM, ACCESS_CONTROL_SERVICE_BASE_URL, and PEOPLE_SERVICE_BASE_URL required (no Joi
// `.default(...)`), on purpose -- a real deployment that omits them must fail fast. But
// `AppModule`'s `ConfigModule.forRoot()` reads/validates `process.env` eagerly when `AppModule`
// is first imported -- before any test's `beforeAll` or `overrideProvider` runs.
//
// `jwt-guard.e2e-spec.ts` overrides `ConfigService` with the ephemeral Testcontainers-Keycloak's
// real values once its container is up. These placeholders are only seen by the eager validation
// pass, never by production adapters in suites that override the ports they call.
//
// Deliberately an explicit falsy check, not `??=`: an empty string from CI must not pass through.
if (!process.env.KEYCLOAK_BASE_URL) {
  process.env.KEYCLOAK_BASE_URL = 'http://localhost:8080';
}
if (!process.env.KEYCLOAK_REALM) {
  process.env.KEYCLOAK_REALM = 'people-management';
}
if (!process.env.ACCESS_CONTROL_SERVICE_BASE_URL) {
  process.env.ACCESS_CONTROL_SERVICE_BASE_URL = 'http://localhost:3007';
}
if (!process.env.PEOPLE_SERVICE_BASE_URL) {
  process.env.PEOPLE_SERVICE_BASE_URL = 'http://localhost:3002';
}
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    'postgresql://placeholder:placeholder@localhost:5432/placeholder';
}
