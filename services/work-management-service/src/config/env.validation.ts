import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3004),
  CORS_ORIGIN: Joi.string().uri().default('http://localhost:4200'),
  DATABASE_URL: Joi.string().required(),
  // No .default(...) for either Keycloak value, deliberately: these anchor signature/issuer
  // validation (JwtStrategy's deriveIssuer/deriveJwksUri), so a real deployment that omits them
  // must fail fast at startup, not silently fall back to a localhost value that can never match
  // a real Keycloak's issuer. Ported verbatim from people-service's own schema (spec-1-7).
  KEYCLOAK_BASE_URL: Joi.string().uri().required(),
  KEYCLOAK_REALM: Joi.string()
    .pattern(/^[A-Za-z0-9_-]+$/)
    .required(),
  // access-control-service -- called by ManagementNotesService to resolve the caller's access role
  // toward the S7 note's subject (reporting/PP/project-line + projectRoles). A network
  // failure/non-2xx fails closed to "no access" at the adapter, but a missing base URL must still
  // fail fast at startup, same reasoning as people-service's own ACCESS_CONTROL_SERVICE_BASE_URL.
  ACCESS_CONTROL_SERVICE_BASE_URL: Joi.string().uri().required(),
  PEOPLE_SERVICE_BASE_URL: Joi.string().uri().required(),
  SERVICE_AUTH_PRIVATE_KEY_PATH: Joi.string().optional(),
  SERVICE_AUTH_KEY_ID: Joi.string().optional(),
  SERVICE_AUTH_SIGNING_ALG: Joi.string().valid('RS256').default('RS256'),
});
