import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3001),
  CORS_ORIGIN: Joi.string().uri().default('http://localhost:4200'),
  PEOPLE_SERVICE_URL: Joi.string().uri().default('http://localhost:3002'),
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
});
