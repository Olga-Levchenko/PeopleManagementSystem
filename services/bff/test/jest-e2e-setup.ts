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
if (!process.env.KEYCLOAK_BASE_URL) {
  process.env.KEYCLOAK_BASE_URL = 'http://localhost:8080';
}
if (!process.env.KEYCLOAK_REALM) {
  process.env.KEYCLOAK_REALM = 'people-management';
}
if (!process.env.ACCESS_CONTROL_SERVICE_BASE_URL) {
  process.env.ACCESS_CONTROL_SERVICE_BASE_URL = 'http://localhost:3007';
}
