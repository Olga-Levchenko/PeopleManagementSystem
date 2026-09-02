import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3008),
  CORS_ORIGIN: Joi.string().uri().default('http://localhost:4200'),
  // Base URL of the Keycloak server (no trailing slash, no /realms/... suffix) — this
  // service's own realm-export.json provisions KEYCLOAK_REALM on that server.
  KEYCLOAK_BASE_URL: Joi.string().uri().required(),
  KEYCLOAK_REALM: Joi.string().min(1).required(),
});
