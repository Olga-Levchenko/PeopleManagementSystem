// Runs before each e2e test file's own imports. `env.validation.ts` makes KEYCLOAK_BASE_URL/
// KEYCLOAK_REALM required (no Joi .default(...)), on purpose -- a real deployment that omits them
// must fail fast rather than silently validating tokens against a localhost fallback. But
// `AppModule`'s `ConfigModule.forRoot()` reads/validates `process.env` eagerly, the moment
// `AppModule` is first imported -- before any test's own `beforeAll` or `overrideProvider` call
// gets a chance to run. Without a placeholder here, importing `AppModule` at all (even in
// `app.e2e-spec.ts`, which never touches Keycloak) would throw at import time.
//
// `jwt-guard.e2e-spec.ts` overrides `ConfigService` with the ephemeral Testcontainers-Keycloak's
// real `KEYCLOAK_BASE_URL`/`KEYCLOAK_REALM` once its container is up -- these placeholders are
// only ever seen by the eager, pre-override validation pass, never by `JwtStrategy` itself.
//
// Deliberately an explicit falsy check, not `??=`: `??=` only fills in `null`/`undefined`, so an
// already-set *empty string* (e.g. an unset CI secret that resolves to `''`) would pass through
// unchanged and still fail Joi's `.required()` for any e2e spec that doesn't need a real
// Keycloak -- an empty string is not a value worth preserving here.
//
// Mirrors services/bff/test/jest-e2e-setup.ts exactly.
if (!process.env.KEYCLOAK_BASE_URL) {
  process.env.KEYCLOAK_BASE_URL = 'http://localhost:8080';
}
if (!process.env.KEYCLOAK_REALM) {
  process.env.KEYCLOAK_REALM = 'people-management';
}
// Same reasoning: env.validation.ts makes this required (no default) so a real deployment fails
// fast rather than silently resolving every non-Self profile request as Colleague forever. This
// placeholder is only ever seen by the eager pre-override validation pass -- no e2e spec in this
// service actually exercises a live access-control-service call today.
if (!process.env.ACCESS_CONTROL_SERVICE_BASE_URL) {
  process.env.ACCESS_CONTROL_SERVICE_BASE_URL = 'http://localhost:3007';
}
// DATABASE_URL/RABBITMQ_URL have no Joi .default(...) either. Every e2e suite that needs a real
// Postgres (app.e2e-spec.ts, profile.e2e-spec.ts) overrides ConfigService directly once its own
// Testcontainers container is up -- these placeholders exist purely so the eager, pre-override
// validation pass doesn't throw at AppModule import time. This was previously masked in local runs
// by a developer's own .env happening to already set both -- CI has no .env file, so a clean run
// failed outright until this was added (Config validation error: "DATABASE_URL" is required.
// "RABBITMQ_URL" is required, thrown from AppModule's ConfigModule.forRoot before any test ran).
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    'postgresql://placeholder:placeholder@localhost:5432/placeholder';
}
if (!process.env.RABBITMQ_URL) {
  process.env.RABBITMQ_URL = 'amqp://placeholder:placeholder@localhost:5672';
}
