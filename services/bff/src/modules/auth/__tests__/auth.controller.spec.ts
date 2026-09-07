import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { generators } from 'openid-client';
import { AuthController } from '../auth.controller';
import { OidcService } from '../oidc.service';
import type { BffSession } from '../session.types';

// openid-client generators are used directly in the controller (for state generation); mock them.
jest.mock('openid-client', () => ({
  generators: {
    state: jest.fn().mockReturnValue('mock-state'),
    codeVerifier: jest.fn(),
    codeChallenge: jest.fn(),
  },
}));

function makeOidcService(): jest.Mocked<OidcService> {
  return {
    generatePkce: jest.fn().mockReturnValue({ verifier: 'v', challenge: 'c' }),
    buildAuthorizationUrl: jest
      .fn()
      .mockReturnValue('http://keycloak/auth?state=mock-state'),
    exchangeCode: jest.fn(),
    refreshAccessToken: jest.fn(),
    endSession: jest.fn(),
    validateLogoutToken: jest.fn(),
  } as unknown as jest.Mocked<OidcService>;
}

function makeConfigService(
  values: Record<string, string> = {},
): jest.Mocked<ConfigService> {
  return {
    getOrThrow: jest.fn((key: string) => {
      const v: Record<string, string> = {
        OIDC_CALLBACK_URL: 'http://localhost:3001/api/v1/auth/callback',
        CORS_ORIGIN: 'http://localhost:4200',
        ...values,
      };
      if (v[key] === undefined)
        throw new Error(`Unexpected config key in test: ${key}`);
      return v[key];
    }),
  } as unknown as jest.Mocked<ConfigService>;
}

function mockSession(data: Partial<BffSession> = {}): BffSession {
  return { ...data };
}

function mockRequest(
  session: BffSession,
  query: Record<string, string> = {},
  body: unknown = {},
): Request {
  return {
    session,
    query,
    body,
    headers: {},
    user: undefined,
  } as unknown as Request;
}

function mockResponse(): jest.Mocked<Response> {
  const res = {
    redirect: jest.fn(),
    sendStatus: jest.fn(),
    status: jest.fn(),
    json: jest.fn(),
  } as unknown as jest.Mocked<Response>;
  return res;
}

describe('AuthController', () => {
  let controller: AuthController;
  let oidc: jest.Mocked<OidcService>;

  beforeEach(async () => {
    oidc = makeOidcService();
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: OidcService, useValue: oidc },
        { provide: ConfigService, useValue: makeConfigService() },
      ],
    }).compile();

    controller = module.get(AuthController);
  });

  afterEach(() => jest.clearAllMocks());

  // ---------- GET /auth/login ----------

  describe('login', () => {
    it('redirects to Keycloak authorization URL when no active session', () => {
      const session = mockSession();
      const req = mockRequest(session);
      const res = mockResponse();

      controller.login(req, res);

      expect(generators.state).toHaveBeenCalled();
      expect(oidc.generatePkce).toHaveBeenCalled();
      expect(oidc.buildAuthorizationUrl).toHaveBeenCalledWith(
        'mock-state',
        'c',
        'http://localhost:3001/api/v1/auth/callback',
      );
      expect(res.redirect).toHaveBeenCalledWith(
        'http://keycloak/auth?state=mock-state',
      );
      expect(session.oidcState).toBe('mock-state');
      expect(session.oidcVerifier).toBe('v');
    });

    it('redirects to / immediately when session already has a userId (already authenticated)', () => {
      const session = mockSession({ userId: 'existing-user-sub' });
      const req = mockRequest(session);
      const res = mockResponse();

      controller.login(req, res);

      expect(oidc.buildAuthorizationUrl).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/');
    });
  });

  // ---------- GET /auth/callback ----------

  describe('callback', () => {
    it('stores session data and redirects to / on successful code exchange', async () => {
      const session = mockSession({
        oidcState: 'state-123',
        oidcVerifier: 'verifier-abc',
      });
      const req = mockRequest(session, {
        state: 'state-123',
        code: 'auth-code',
      });
      const res = mockResponse();

      oidc.exchangeCode.mockResolvedValueOnce({
        accessToken: 'at',
        refreshToken: 'rt',
        idToken: 'it',
        sub: 'sub-user',
        email: 'user@test.local',
        accessTokenExpiresAt: 9999,
      });

      await controller.callback(req, res);

      expect(session.userId).toBe('sub-user');
      expect(session.accessToken).toBe('at');
      expect(session.refreshToken).toBe('rt');
      expect(session.idToken).toBe('it');
      expect(session.oidcState).toBeUndefined();
      expect(session.oidcVerifier).toBeUndefined();
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:4200');
    });

    it('throws BadRequestException on state mismatch', async () => {
      const session = mockSession({ oidcState: 'state-xyz' });
      const req = mockRequest(session, { state: 'wrong-state', code: 'code' });
      const res = mockResponse();

      await expect(controller.callback(req, res)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when state is missing from query', async () => {
      const session = mockSession({ oidcState: 'state-xyz' });
      const req = mockRequest(session, { code: 'code' });
      const res = mockResponse();

      await expect(controller.callback(req, res)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when code is missing from query', async () => {
      const session = mockSession({ oidcState: 'state-xyz' });
      const req = mockRequest(session, { state: 'state-xyz' });
      const res = mockResponse();

      await expect(controller.callback(req, res)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when PKCE verifier is missing from session', async () => {
      const session = mockSession({ oidcState: 'state-xyz' });
      const req = mockRequest(session, { state: 'state-xyz', code: 'code' });
      const res = mockResponse();

      await expect(controller.callback(req, res)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('clears transient OIDC session fields even when code exchange throws', async () => {
      const session = mockSession({
        oidcState: 'state-123',
        oidcVerifier: 'verifier-abc',
      });
      const req = mockRequest(session, { state: 'state-123', code: 'code' });
      const res = mockResponse();

      oidc.exchangeCode.mockRejectedValueOnce(
        new Error('Keycloak unreachable'),
      );

      await expect(controller.callback(req, res)).rejects.toThrow();

      // Transient handshake fields must be cleared regardless of exchange outcome.
      expect(session.oidcState).toBeUndefined();
      expect(session.oidcVerifier).toBeUndefined();
    });
  });

  // ---------- POST /auth/logout ----------

  describe('logout', () => {
    it('destroys session, calls endSession with post_logout_redirect_uri, and follows its URL', async () => {
      const session = mockSession({ userId: 'sub', idToken: 'id-token' });
      const destroyMock = jest.fn((cb) => (cb as (err?: unknown) => void)());
      const req = {
        session: { ...session, destroy: destroyMock },
        body: {},
      } as unknown as Request;
      const res = mockResponse();

      const endSessionUrl =
        'http://keycloak/logout?post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A4200%2Flogin';
      oidc.endSession.mockResolvedValueOnce(endSessionUrl);

      controller.logout(req, res);

      expect(destroyMock).toHaveBeenCalled();
      // Wait for the async endSession promise to resolve.
      await new Promise((r) => setImmediate(r));
      expect(oidc.endSession).toHaveBeenCalledWith(
        'id-token',
        'http://localhost:4200/login',
      );
      expect(res.redirect).toHaveBeenCalledWith(endSessionUrl);
    });

    it('falls back to frontend /login when endSession returns no URL', async () => {
      const session = mockSession({ userId: 'sub', idToken: 'id-token' });
      const destroyMock = jest.fn((cb) => (cb as (err?: unknown) => void)());
      const req = {
        session: { ...session, destroy: destroyMock },
        body: {},
      } as unknown as Request;
      const res = mockResponse();

      oidc.endSession.mockResolvedValueOnce(undefined);

      controller.logout(req, res);

      await new Promise((r) => setImmediate(r));
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:4200/login');
    });

    it('redirects to frontend /login directly when no idToken is in session', async () => {
      const session = mockSession({ userId: 'sub' });
      const destroyMock = jest.fn((cb) => (cb as (err?: unknown) => void)());
      const req = {
        session: { ...session, destroy: destroyMock },
        body: {},
      } as unknown as Request;
      const res = mockResponse();

      controller.logout(req, res);

      await new Promise((r) => setImmediate(r));
      expect(oidc.endSession).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:4200/login');
    });
  });

  // ---------- POST /auth/backchannel-logout ----------

  describe('backchannelLogout', () => {
    it('returns 200 when logout token is valid', async () => {
      const session = mockSession();
      const req = mockRequest(session, {}, { logout_token: 'valid-jwt' });
      const res = mockResponse();
      res.sendStatus = jest.fn();

      oidc.validateLogoutToken.mockResolvedValueOnce({
        sub: 'user-sub',
        sid: 'session-1',
      });

      await controller.backchannelLogout(req, res);

      expect(oidc.validateLogoutToken).toHaveBeenCalledWith('valid-jwt');
      expect(res.sendStatus).toHaveBeenCalledWith(200);
    });

    it('throws BadRequestException when logout_token is missing from body', async () => {
      const req = mockRequest(mockSession(), {}, {});
      const res = mockResponse();

      await expect(controller.backchannelLogout(req, res)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when logout token validation fails', async () => {
      const req = mockRequest(
        mockSession(),
        {},
        { logout_token: 'invalid-jwt' },
      );
      const res = mockResponse();

      oidc.validateLogoutToken.mockRejectedValueOnce(
        new Error('Invalid token'),
      );

      await expect(controller.backchannelLogout(req, res)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('scans sessionStore.all() and destroys sessions matching the validated sub', async () => {
      const destroyMock = jest.fn((sid: string, cb: () => void) => cb());
      const allMock = jest.fn(
        (
          cb: (
            err: null,
            sessions: Record<string, { userId?: string }>,
          ) => void,
        ) => {
          cb(null, {
            'sid-to-destroy': { userId: 'target-sub' },
            'sid-keep': { userId: 'other-sub' },
          });
        },
      );

      const req = {
        ...mockRequest(mockSession(), {}, { logout_token: 'valid-jwt' }),
        sessionStore: { all: allMock, destroy: destroyMock },
      } as unknown as Request;
      const res = mockResponse();

      oidc.validateLogoutToken.mockResolvedValueOnce({
        sub: 'target-sub',
        sid: undefined,
      });

      await controller.backchannelLogout(req, res);

      expect(destroyMock).toHaveBeenCalledTimes(1);
      expect(destroyMock).toHaveBeenCalledWith(
        'sid-to-destroy',
        expect.any(Function),
      );
      expect(res.sendStatus).toHaveBeenCalledWith(200);
    });

    it('returns 200 when no session matches the validated sub (no-op)', async () => {
      const destroyMock = jest.fn();
      const allMock = jest.fn(
        (
          cb: (
            err: null,
            sessions: Record<string, { userId?: string }>,
          ) => void,
        ) => {
          cb(null, { 'sid-other': { userId: 'different-user' } });
        },
      );

      const req = {
        ...mockRequest(mockSession(), {}, { logout_token: 'valid-jwt' }),
        sessionStore: { all: allMock, destroy: destroyMock },
      } as unknown as Request;
      const res = mockResponse();

      oidc.validateLogoutToken.mockResolvedValueOnce({
        sub: 'target-sub',
        sid: undefined,
      });

      await controller.backchannelLogout(req, res);

      expect(destroyMock).not.toHaveBeenCalled();
      expect(res.sendStatus).toHaveBeenCalledWith(200);
    });
  });

  // ---------- GET /auth/me ----------

  describe('me', () => {
    it('returns sub and email when req.user is set (session check already passed in guard)', () => {
      const session = mockSession({ email: 'user@test.local' });
      const req = {
        ...mockRequest(session),
        user: { sub: 'sub-123' },
      } as unknown as Request;

      const result = controller.me(req);

      expect(result).toEqual({ sub: 'sub-123', email: 'user@test.local' });
    });

    it('throws UnauthorizedException when req.user is absent', () => {
      const req = mockRequest(mockSession());

      expect(() => controller.me(req)).toThrow(UnauthorizedException);
    });
  });
});
