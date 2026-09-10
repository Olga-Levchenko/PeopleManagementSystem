import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3001),
  CORS_ORIGIN: Joi.string().uri().default('http://localhost:4200'),
  PEOPLE_SERVICE_URL: Joi.string().uri().default('http://localhost:3002'),
  ACCESS_CONTROL_SERVICE_BASE_URL: Joi.string().uri().required(),
  WORK_MANAGEMENT_SERVICE_URL: Joi.string()
    .uri()
    .default('http://localhost:3004'),
  // No .default(...) for either Keycloak value, deliberately: these anchor signature/issuer
  // validation (JwtStrategy's deriveIssuer/deriveJwksUri), so a real deployment that omits them
  // must fail fast at startup, not silently fall back to a localhost value that can never match
  // a real Keycloak's issuer. See test/jest-e2e-setup.ts for how the e2e test runner supplies a
  // placeholder so AppModule can still be imported without a real Keycloak configured.
  KEYCLOAK_BASE_URL: Joi.string().uri().required(),
  // Letters/digits/hyphens/underscores only, matching authentication-service's
  // AppConfig.ValidateRealmName -- this value is spliced directly into deriveIssuer/deriveJwksUri
  // and then used in a real outbound JWKS request; unvalidated, a stray '/', '?', '#', or
  // whitespace would silently produce a malformed URL instead of failing fast at startup.
  KEYCLOAK_REALM: Joi.string()
    .pattern(/^[A-Za-z0-9_-]+$/)
    .required(),
  // Private-key JWT material for the confidential OIDC client. The key itself is deployment
  // injected and is never stored in this repository.
  KEYCLOAK_CLIENT_PRIVATE_KEY_PATH: Joi.string().min(1).required(),
  KEYCLOAK_CLIENT_KEY_ID: Joi.string()
    .pattern(/^[A-Za-z0-9._-]+$/)
    .required(),
  KEYCLOAK_CLIENT_AUTH_SIGNING_ALG: Joi.string().valid('RS256').required(),
  // Secret for express-session cookie signing. Min 32 chars enforced to prevent trivially weak
  // secrets slipping into production.
  SESSION_SECRET: Joi.string().min(32).required(),
  // The full callback URL Keycloak redirects the browser back to after authorization. Must exactly
  // match one of the `redirectUris` registered on the `bff-confidential` client in realm-export.json.
  OIDC_CALLBACK_URL: Joi.string().uri().required(),
  // Optional PostgreSQL connection string for the persistent session store (connect-pg-simple).
  // When absent the BFF falls back to MemoryStore with a startup warning -- acceptable for
  // zero-infra local dev, not for production. See main.ts for the conditional store initialization.
  DATABASE_URL: Joi.string().uri().optional(),
});
