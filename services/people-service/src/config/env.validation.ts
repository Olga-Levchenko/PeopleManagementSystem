import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3002),
  CORS_ORIGIN: Joi.string().uri().default('http://localhost:4200'),
  DATABASE_URL: Joi.string().required(),
  RABBITMQ_URL: Joi.string()
    .uri({ scheme: ['amqp', 'amqps'] })
    .required(),
  RABBITMQ_EXCHANGE: Joi.string().min(1).default('people.relationships'),
  OUTBOX_PUBLISHER_RETRY_LIMIT: Joi.number().integer().min(1).default(5),
  OUTBOX_STALE_LOCK_MINUTES: Joi.number().integer().min(1).default(10),
  OUTBOX_PUBLISHER_INTERVAL_MS: Joi.number().integer().min(100).default(1000),
  // No .default(...) for either Keycloak value, deliberately: these anchor signature/issuer
  // validation (JwtStrategy's deriveIssuer/deriveJwksUri), so a real deployment that omits them
  // must fail fast at startup, not silently fall back to a localhost value that can never match
  // a real Keycloak's issuer. Mirrors the BFF's own already-reviewed schema exactly -- see
  // test/jest-e2e-setup.ts for how the e2e test runner supplies a placeholder so AppModule can
  // still be imported without a real Keycloak configured.
  KEYCLOAK_BASE_URL: Joi.string().uri().required(),
  // Letters/digits/hyphens/underscores only, matching authentication-service's
  // AppConfig.ValidateRealmName -- this value is spliced directly into deriveIssuer/deriveJwksUri
  // and then used in a real outbound JWKS request; unvalidated, a stray '/', '?', '#', or
  // whitespace would silently produce a malformed URL instead of failing fast at startup.
  KEYCLOAK_REALM: Joi.string()
    .pattern(/^[A-Za-z0-9_-]+$/)
    .required(),
});
