import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { deriveIssuer, deriveJwksUri, JwtStrategy } from '../jwt.strategy';

/** The internal shape passport-jwt's `Strategy` constructor stores verify options under. */
interface StrategyInternals {
  _verifOpts: {
    audience?: string;
    issuer?: string;
    algorithms?: string[];
    clockTolerance?: number;
  };
}

function fakeConfig(values: Record<string, string>): ConfigService {
  return {
    getOrThrow: jest.fn((key: string) => {
      const value = values[key];
      if (value === undefined) {
        throw new Error(`Unexpected config key requested in test: ${key}`);
      }
      return value;
    }),
  } as unknown as ConfigService;
}

describe('JwtStrategy', () => {
  const config = fakeConfig({
    KEYCLOAK_BASE_URL: 'http://localhost:8080',
    KEYCLOAK_REALM: 'people-management',
  });
  const bffRequest = { path: '/api/v1/people' } as never;
  const internalRequest = {
    path: '/api/v1/internal/identity-mappings/resolve',
  } as never;
  const bootstrapRequest = {
    path: '/api/v1/internal/bootstrap/identity-mappings/resolve',
  } as never;

  it('returns exactly { sub }, discarding every other claim on the payload', () => {
    const strategy = new JwtStrategy(config);
    const payload = {
      sub: 'a1b2c3-employee-id',
      email: 'story1-11.test-user@peoplemanagement.local',
      preferred_username: 'story1-11.test-user',
      realm_access: { roles: ['some-role'] },
      azp: 'bff-confidential',
      iss: 'https://localhost:8080/realms/people-management',
      exp: 9999999999,
    };

    const result = strategy.validate(bffRequest, payload);

    expect(result).toEqual({
      sub: 'a1b2c3-employee-id',
      iss: 'https://localhost:8080/realms/people-management',
    });
    expect(Object.keys(result)).toEqual(['sub', 'iss']);
  });

  it('rejects a payload with no sub claim', () => {
    const strategy = new JwtStrategy(config);

    expect(() =>
      strategy.validate(bffRequest, { sub: undefined as unknown as string }),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a payload with a blank/whitespace-only sub claim', () => {
    const strategy = new JwtStrategy(config);

    expect(() => strategy.validate(bffRequest, { sub: '   ' })).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a payload with a non-string sub claim instead of throwing a raw TypeError', () => {
    const strategy = new JwtStrategy(config);

    // A signature-valid token can still carry a malformed/unexpected claim shape (e.g. sub as a
    // number or object) -- calling .trim() on a non-string would throw an unhandled TypeError
    // (surfacing as a 500) instead of the clean, intentional 401 this guard is meant to produce.
    expect(() =>
      strategy.validate(bffRequest, { sub: 12345 as unknown as string }),
    ).toThrow(UnauthorizedException);
    expect(() =>
      strategy.validate(bffRequest, {
        sub: { nested: true } as unknown as string,
      }),
    ).toThrow(UnauthorizedException);
  });

  it('trims a trailing slash from KEYCLOAK_BASE_URL so issuer/jwksUri never double up a slash', () => {
    const trailingSlashConfig = fakeConfig({
      KEYCLOAK_BASE_URL: 'http://localhost:8080/',
      KEYCLOAK_REALM: 'people-management',
    });

    const issuer = deriveIssuer(trailingSlashConfig);

    expect(issuer).toBe('http://localhost:8080/realms/people-management');
    expect(deriveJwksUri(issuer)).toBe(
      'http://localhost:8080/realms/people-management/protocol/openid-connect/certs',
    );

    // Also prove the strategy actually constructs from this same (trimmed) issuer end to end.
    const strategy = new JwtStrategy(trailingSlashConfig);
    expect((strategy as unknown as StrategyInternals)._verifOpts.issuer).toBe(
      issuer,
    );
  });

  it('validates the audience claim against the people-service client id', () => {
    const strategy = new JwtStrategy(config);

    expect((strategy as unknown as StrategyInternals)._verifOpts.audience).toBe(
      'people-service',
    );
  });

  it('allows trusted internal callers on identity resolution', () => {
    const strategy = new JwtStrategy(config);

    for (const azp of ['access-control-service', 'work-management-service']) {
      expect(
        strategy.validate(internalRequest, {
          sub: 'service-sub',
          azp,
          iss: 'https://localhost:8080/realms/people-management',
        }),
      ).toEqual({
        sub: 'service-sub',
        iss: 'https://localhost:8080/realms/people-management',
      });
    }
  });

  it('rejects an unauthorized caller on identity resolution', () => {
    const strategy = new JwtStrategy(config);

    expect(() =>
      strategy.validate(internalRequest, {
        sub: 'service-sub',
        azp: 'bff-confidential',
        iss: 'https://localhost:8080/realms/people-management',
      }),
    ).toThrow(ForbiddenException);
  });

  it('allows Access Control only on bootstrap target resolution', () => {
    const strategy = new JwtStrategy(config);

    expect(
      strategy.validate(bootstrapRequest, {
        sub: 'deployment-operator',
        azp: 'access-control-service',
        iss: 'https://localhost:8080/realms/people-management',
      }),
    ).toEqual({
      sub: 'deployment-operator',
      iss: 'https://localhost:8080/realms/people-management',
    });
  });

  it('rejects a delegated browser caller on bootstrap target resolution', () => {
    const strategy = new JwtStrategy(config);

    expect(() =>
      strategy.validate(bootstrapRequest, {
        sub: 'user-sub',
        azp: 'bff-confidential',
        iss: 'https://localhost:8080/realms/people-management',
      }),
    ).toThrow(ForbiddenException);
  });

  it('sets a small clock-tolerance for real clock drift between this process and Keycloak', () => {
    const strategy = new JwtStrategy(config);

    expect(
      (strategy as unknown as StrategyInternals)._verifOpts.clockTolerance,
    ).toBe(5);
  });
});
