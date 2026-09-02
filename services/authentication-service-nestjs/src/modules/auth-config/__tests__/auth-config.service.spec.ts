import { ConfigService } from '@nestjs/config';
import { AuthConfigService } from '../auth-config.service';

describe('AuthConfigService', () => {
  const createService = (env: Record<string, string>) =>
    new AuthConfigService(new ConfigService(env));

  it('derives issuer, jwksUri, and realm from KEYCLOAK_BASE_URL/KEYCLOAK_REALM', () => {
    const service = createService({
      KEYCLOAK_BASE_URL: 'http://localhost:8080',
      KEYCLOAK_REALM: 'people-management',
    });

    expect(service.getConfig()).toEqual({
      issuer: 'http://localhost:8080/realms/people-management',
      jwksUri:
        'http://localhost:8080/realms/people-management/protocol/openid-connect/certs',
      realm: 'people-management',
    });
  });

  it('throws when required config is missing rather than returning a partial config', () => {
    const service = createService({
      KEYCLOAK_BASE_URL: 'http://localhost:8080',
    });

    expect(() => service.getConfig()).toThrow();
  });
});
