import { envValidationSchema } from '../env.validation';

/**
 * Proves `envValidationSchema`'s Joi constraints are actually live -- every other test in this
 * service only ever supplies pre-sanitized config values, so a future accidental loosening of
 * `.required()`/`.pattern()` (or a reintroduced silent `.default(...)`) would pass every existing
 * test unnoticed. This calls `.validate()` directly with deliberately bad input.
 */
describe('envValidationSchema', () => {
  const validEnv = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/people',
    RABBITMQ_URL: 'amqp://guest:guest@localhost:5672',
    KEYCLOAK_BASE_URL: 'http://localhost:8080',
    KEYCLOAK_REALM: 'people-management',
  };

  it('accepts a fully valid environment with no error', () => {
    const { error } = envValidationSchema.validate(validEnv);

    expect(error).toBeUndefined();
  });

  it('rejects an environment with KEYCLOAK_REALM omitted', () => {
    const withoutRealm: Record<string, string> = { ...validEnv };
    delete withoutRealm.KEYCLOAK_REALM;
    const { error } = envValidationSchema.validate(withoutRealm);

    expect(error).toBeTruthy();
  });

  it.each([
    ['a forward slash', 'people/management'],
    ['a question mark', 'people?management'],
    ['a hash', 'people#management'],
    ['embedded whitespace', 'people management'],
  ])('rejects KEYCLOAK_REALM containing %s', (_label, badRealm) => {
    const { error } = envValidationSchema.validate({
      ...validEnv,
      KEYCLOAK_REALM: badRealm,
    });

    expect(error).toBeTruthy();
  });

  it('rejects an environment with KEYCLOAK_BASE_URL omitted', () => {
    const withoutBaseUrl: Record<string, string> = { ...validEnv };
    delete withoutBaseUrl.KEYCLOAK_BASE_URL;
    const { error } = envValidationSchema.validate(withoutBaseUrl);

    expect(error).toBeTruthy();
  });
});
