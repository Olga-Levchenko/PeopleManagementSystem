import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  grant: jest.Mock;
  endSessionUrl: jest.Mock;
  validateLogoutToken: jest.Mock;
  issuer: {
    metadata: {
      end_session_endpoint: string;
      token_endpoint: string;
    };
  };
};

// Mock openid-client at the module level so no real network calls happen in unit tests.
jest.mock('openid-client', () => {
  mockClient = {
    authorizationUrl: jest.fn(),
    callback: jest.fn(),
    refresh: jest.fn(),
    grant: jest.fn(),
    endSessionUrl: jest.fn(),
    validateLogoutToken: jest.fn(),
    issuer: {
      metadata: {
        end_session_endpoint:
          'http://keycloak/realms/test/protocol/openid-connect/logout',
        token_endpoint:
          'http://keycloak/realms/test/protocol/openid-connect/token',
      },
    },
  };

  const MockIssuer = {
    discover: jest.fn().mockResolvedValue({
      Client: jest.fn().mockImplementation(() => mockClient),
      metadata: { jwks_uri: 'http://keycloak/jwks' },
    }),
  };

  return {
    Issuer: MockIssuer,
    generators: {
      codeVerifier: jest.fn().mockReturnValue('mock-verifier'),
      codeChallenge: jest.fn().mockReturnValue('mock-challenge'),
      state: jest.fn().mockReturnValue('mock-state'),
      random: jest.fn().mockReturnValue('mock-jti'),
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
  const configValues: Record<string, string> = {
    KEYCLOAK_BASE_URL: 'http://localhost:8080',
    KEYCLOAK_REALM: 'people-management',
    KEYCLOAK_CLIENT_PRIVATE_KEY_PATH: '',
    KEYCLOAK_CLIENT_KEY_ID: 'test-key',
    KEYCLOAK_CLIENT_AUTH_SIGNING_ALG: 'RS256',
  };
  let temporaryKeyDirectory: string;

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

  beforeAll(async () => {
    temporaryKeyDirectory = await mkdtemp(join(tmpdir(), 'bff-oidc-test-'));
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const privateKeyPath = join(
      temporaryKeyDirectory,
      'client-private-key.pem',
    );
    await writeFile(
      privateKeyPath,
      privateKey.export({ format: 'pem', type: 'pkcs8' }),
    );
    configValues.KEYCLOAK_CLIENT_PRIVATE_KEY_PATH = privateKeyPath;
  });

  afterAll(async () => {
    await rm(temporaryKeyDirectory, { recursive: true, force: true });
  });

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

  describe('exchangeForAudience', () => {
    it('requests only an allowlisted audience with a short-lived endpoint-bound assertion', async () => {
      const service = await buildService();
      mockClient.grant.mockResolvedValueOnce({
        access_token: 'exchanged-at',
        expires_at: Math.floor(Date.now() / 1000) + 300,
      });

      const result = await service.exchangeForAudience(
        'browser-at',
        'people-service',
      );

      expect(result).toBe('exchanged-at');
      const [body, extras] = mockClient.grant.mock.calls[0];
      expect(body).toEqual(
        expect.objectContaining({
          grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
          subject_token: 'browser-at',
          audience: 'people-service',
          scope: 'people-service-audience',
        }),
      );
      expect(extras.clientAssertionPayload).toEqual(
        expect.objectContaining({
          aud: 'http://keycloak/realms/test/protocol/openid-connect/token',
          exp: expect.any(Number),
          iat: expect.any(Number),
          jti: expect.any(String),
        }),
      );
      expect(
        extras.clientAssertionPayload.exp - extras.clientAssertionPayload.iat,
      ).toBe(60);
    });

    it('requests only the access-control-service audience scope', async () => {
      const service = await buildService();
      mockClient.grant.mockResolvedValueOnce({
        access_token: 'exchanged-at',
        expires_at: Math.floor(Date.now() / 1000) + 300,
      });

      await service.exchangeForAudience('browser-at', 'access-control-service');

      const [body] = mockClient.grant.mock.calls[0];
      expect(body).toEqual(
        expect.objectContaining({
          audience: 'access-control-service',
          scope: 'access-control-service-audience',
        }),
      );
    });

    it('rejects an audience outside the two backend targets', async () => {
      const service = await buildService();

      await expect(
        service.exchangeForAudience('browser-at', 'unknown-service' as never),
      ).rejects.toThrow('Requested token audience is not allowed.');
      expect(mockClient.grant).not.toHaveBeenCalled();
    });
  });

  describe('validateLogoutToken', () => {
    it('returns sub and sid from a validated logout token', async () => {
      const service = await buildService();
      const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
      });
      const header = { alg: 'RS256', kid: 'logout-key' };
      const payload = {
        iss: 'http://localhost:8080/realms/people-management',
        aud: 'bff-confidential',
        sub: 'user-sub-1',
        sid: 'session-abc',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60,
        events: {
          'http://schemas.openid.net/event/backchannel-logout': {},
        },
      };
      const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
        'base64url',
      );
      const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
        'base64url',
      );
      const signingInput = `${encodedHeader}.${encodedPayload}`;
      const encodedSignature = sign(
        'RSA-SHA256',
        Buffer.from(signingInput),
        privateKey,
      ).toString('base64url');
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          keys: [
            {
              ...publicKey.export({ format: 'jwk' }),
              kid: 'logout-key',
              alg: 'RS256',
              use: 'sig',
            },
          ],
        }),
      });

      const result = await service.validateLogoutToken(
        `${signingInput}.${encodedSignature}`,
      );

      expect(result.sub).toBe('user-sub-1');
      expect(result.sid).toBe('session-abc');
    });

    it('rejects a logout token without the back-channel logout event', async () => {
      const service = await buildService();
      const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
      });
      const header = { alg: 'RS256', kid: 'logout-key' };
      const payload = {
        iss: 'http://localhost:8080/realms/people-management',
        aud: 'bff-confidential',
        sub: 'user-sub-1',
        sid: 'session-abc',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60,
        events: {},
      };
      const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
        'base64url',
      );
      const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
        'base64url',
      );
      const signingInput = `${encodedHeader}.${encodedPayload}`;
      const encodedSignature = sign(
        'RSA-SHA256',
        Buffer.from(signingInput),
        privateKey,
      ).toString('base64url');
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          keys: [
            {
              ...publicKey.export({ format: 'jwk' }),
              kid: 'logout-key',
            },
          ],
        }),
      });

      await expect(
        service.validateLogoutToken(`${signingInput}.${encodedSignature}`),
      ).rejects.toThrow('Invalid logout token claims.');
    });
  });
});
