import { UnauthorizedException } from '@nestjs/common';
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

  it('returns exactly { sub }, discarding every other claim on the payload', () => {
    const strategy = new JwtStrategy(config);
    const payload = {
      sub: 'a1b2c3-employee-id',
      email: 'story1-11.test-user@peoplemanagement.local',
      preferred_username: 'story1-11.test-user',
      realm_access: { roles: ['some-role'] },
      exp: 9999999999,
    };

    const result = strategy.validate(payload);

    expect(result).toEqual({ sub: 'a1b2c3-employee-id' });
    expect(Object.keys(result)).toEqual(['sub']);
  });

  it('rejects a payload with no sub claim', () => {
    const strategy = new JwtStrategy(config);

    expect(() =>
      strategy.validate({ sub: undefined as unknown as string }),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a payload with a blank/whitespace-only sub claim', () => {
    const strategy = new JwtStrategy(config);

    expect(() => strategy.validate({ sub: '   ' })).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a payload with a non-string sub claim instead of throwing a raw TypeError', () => {
    const strategy = new JwtStrategy(config);

    // A signature-valid token can still carry a malformed/unexpected claim shape (e.g. sub as a
    // number or object) -- calling .trim() on a non-string would throw an unhandled TypeError
    // (surfacing as a 500) instead of the clean, intentional 401 this guard is meant to produce.
    expect(() =>
      strategy.validate({ sub: 12345 as unknown as string }),
    ).toThrow(UnauthorizedException);
    expect(() =>
      strategy.validate({ sub: { nested: true } as unknown as string }),
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

  it('validates the audience claim against the bff-confidential client id', () => {
    const strategy = new JwtStrategy(config);

    expect((strategy as unknown as StrategyInternals)._verifOpts.audience).toBe(
      'bff-confidential',
    );
  });

  it('sets a small clock-tolerance for real clock drift between this process and Keycloak', () => {
    const strategy = new JwtStrategy(config);

    expect(
      (strategy as unknown as StrategyInternals)._verifOpts.clockTolerance,
    ).toBe(5);
  });
});
