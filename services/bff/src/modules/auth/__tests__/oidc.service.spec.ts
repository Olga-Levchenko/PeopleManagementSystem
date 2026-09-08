import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { generators, Issuer } from 'openid-client';
import { OidcService } from '../oidc.service';

// Shared mock client methods -- declared as `var` so they are hoisted along with `jest.mock()`.
// Using `var` (not `const`/`let`) is the standard pattern when mock factory functions need to
// reference module-level state, because Jest hoists `jest.mock()` calls above all `const`/`let`
// declarations but does not hoist their initializers (causing TDZ / "before initialization" errors).
// eslint-disable-next-line no-var
var mockClient: {
  authorizationUrl: jest.Mock;
  callback: jest.Mock;
  refresh: jest.Mock;
  endSessionUrl: jest.Mock;
  validateLogoutToken: jest.Mock;
  issuer: { metadata: { end_session_endpoint: string } };
};

// Mock openid-client at the module level so no real network calls happen in unit tests.
jest.mock('openid-client', () => {
  mockClient = {
    authorizationUrl: jest.fn(),
    callback: jest.fn(),
    refresh: jest.fn(),
    endSessionUrl: jest.fn(),
    validateLogoutToken: jest.fn(),
    issuer: {
      metadata: {
        end_session_endpoint:
          'http://keycloak/realms/test/protocol/openid-connect/logout',
      },
    },
  };

  const MockIssuer = {
    discover: jest.fn().mockResolvedValue({
      Client: jest.fn().mockImplementation(() => mockClient),
      metadata: {},
    }),
  };

  return {
    Issuer: MockIssuer,
    generators: {
      codeVerifier: jest.fn().mockReturnValue('mock-verifier'),
      codeChallenge: jest.fn().mockReturnValue('mock-challenge'),
      state: jest.fn().mockReturnValue('mock-state'),
    },
  };
});

function makeConfig(values: Record<string, string>): ConfigService {
  return {
    getOrThrow: jest.fn((key: string) => {
      const v = values[key];
      if (v === undefined) throw new Error(`Unexpected config key: ${key}`);
      return v;
    }),
  } as unknown as ConfigService;
}

describe('OidcService', () => {
  const configValues = {
    KEYCLOAK_BASE_URL: 'http://localhost:8080',
    KEYCLOAK_REALM: 'people-management',
    KEYCLOAK_CLIENT_SECRET: 'test-secret',
  };

  async function buildService(): Promise<OidcService> {
    const module = await Test.createTestingModule({
      providers: [
        OidcService,
        { provide: ConfigService, useValue: makeConfig(configValues) },
      ],
    }).compile();

    const service = module.get(OidcService);
    await service.onModuleInit();
    return service;
  }

  afterEach(() => jest.clearAllMocks());

  describe('onModuleInit', () => {
    it('calls Issuer.discover with the derived issuer URL', async () => {
      await buildService();

      expect(Issuer.discover).toHaveBeenCalledWith(
        'http://localhost:8080/realms/people-management',
      );
    });
  });

  describe('generatePkce', () => {
    it('returns a verifier and challenge from openid-client generators', async () => {
      const service = await buildService();

      const result = service.generatePkce();

      expect(generators.codeVerifier).toHaveBeenCalled();
      expect(generators.codeChallenge).toHaveBeenCalledWith('mock-verifier');
      expect(result).toEqual({
        verifier: 'mock-verifier',
        challenge: 'mock-challenge',
      });
    });
  });

  describe('buildAuthorizationUrl', () => {
    it('delegates to client.authorizationUrl with S256 PKCE and the provided state', async () => {
      const service = await buildService();

      service.buildAuthorizationUrl(
        'state-abc',
        'challenge-xyz',
        'http://localhost:3001/callback',
      );

      expect(mockClient.authorizationUrl).toHaveBeenCalledWith({
        scope: 'openid email profile',
        state: 'state-abc',
        redirect_uri: 'http://localhost:3001/callback',
        code_challenge: 'challenge-xyz',
        code_challenge_method: 'S256',
      });
    });
  });

  describe('exchangeCode', () => {
    it('returns mapped token fields from client.callback', async () => {
      const service = await buildService();

      mockClient.callback.mockResolvedValueOnce({
        access_token: 'at-abc',
        refresh_token: 'rt-abc',
        id_token: 'it-abc',
        expires_at: 9999,
        claims: () => ({
          sub: 'user-sub-1',
          email: 'user@test.local',
        }),
      });

      const result = await service.exchangeCode(
        {
          code: 'auth-code',
          iss: 'http://localhost:8080/realms/people-management',
        },
        'http://localhost:3001/callback',
        'verifier-xyz',
      );

      expect(result.accessToken).toBe('at-abc');
      expect(result.refreshToken).toBe('rt-abc');
      expect(result.idToken).toBe('it-abc');
      expect(result.sub).toBe('user-sub-1');
      expect(result.email).toBe('user@test.local');
      expect(result.accessTokenExpiresAt).toBe(9999);
    });
  });

  describe('refreshAccessToken', () => {
    it('returns a fresh access token from client.refresh', async () => {
      const service = await buildService();

      mockClient.refresh.mockResolvedValueOnce({
        access_token: 'new-at',
        refresh_token: 'new-rt',
        id_token: 'new-it',
        expires_at: 10000,
        claims: () => ({ sub: 'user-sub-1' }),
      });

      const result = await service.refreshAccessToken('old-rt');

      expect(result.accessToken).toBe('new-at');
      expect(result.accessTokenExpiresAt).toBe(10000);
    });
  });

  describe('validateLogoutToken', () => {
    it('returns sub and sid from a validated logout token', async () => {
      const service = await buildService();

      mockClient.validateLogoutToken.mockResolvedValueOnce({
        claims: () => ({ sub: 'user-sub-1', sid: 'session-abc' }),
      });

      const result = await service.validateLogoutToken('signed-jwt-token');

      expect(result.sub).toBe('user-sub-1');
      expect(result.sid).toBe('session-abc');
    });
  });
});
