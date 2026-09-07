import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../public.decorator';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { OidcService } from '../oidc.service';
import type { BffSession } from '../session.types';

describe('JwtAuthGuard', () => {
  // Same handler/class reference on every call -- Reflector.getAllAndOverride is asserted against
  // these exact references, and two separately-created anonymous functions/classes are never
  // considered equal by Jest's argument matching.
  const handler = function whoami() {};
  const controllerClass = class ProbeController {};

  function makeOidcService(): jest.Mocked<OidcService> {
    return {
      refreshAccessToken: jest.fn(),
    } as unknown as jest.Mocked<OidcService>;
  }

  /**
   * Creates an ExecutionContext backed by a stable request object. The same object reference is
   * returned on every `getRequest()` call so that mutations made inside `canActivate` (e.g.
   * setting `req.user` or updating `req.session.*`) are visible to the test after the call.
   *
   * The session is NOT spread-copied: `request.session` IS the provided `sessionData` object
   * (with `destroy` added), so mutations to `request.session.accessToken` update the original
   * object and tests can assert them directly via `context.switchToHttp().getRequest().session`.
   */
  function createContext(
    sessionData: Partial<BffSession> = {},
  ): ExecutionContext {
    const sessionDestroyMock = jest.fn((cb) =>
      (cb as (err?: unknown) => void)(),
    );
    // Mutable request object -- a stable reference returned on every getRequest() call.
    const request: {
      session: Partial<BffSession> & { destroy: jest.Mock };
      user: unknown;
    } = {
      session: Object.assign(sessionData, { destroy: sessionDestroyMock }),
      user: undefined,
    };
    return {
      getHandler: () => handler,
      getClass: () => controllerClass,
      switchToHttp: () => ({
        getRequest: <T>() => request as unknown as T,
      }),
    } as unknown as ExecutionContext;
  }

  function superCanActivateSpy() {
    // JwtAuthGuard extends AuthGuard('jwt') -- the mixin class captured at this file's own
    // class-definition time. Spying on the prototype one level up from JwtAuthGuard.prototype
    // targets that exact base class, not a freshly-minted AuthGuard('jwt') from calling it again
    // here (which would be a different class entirely).
    return jest.spyOn(
      Object.getPrototypeOf(JwtAuthGuard.prototype),
      'canActivate',
    );
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('bypasses passport entirely when @Public() metadata is present, without calling the parent guard', async () => {
    const getAllAndOverride = jest.fn().mockReturnValue(true);
    const reflector = { getAllAndOverride } as unknown as Reflector;
    const oidc = makeOidcService();
    const guard = new JwtAuthGuard(reflector, oidc);
    const superCanActivate = superCanActivateSpy();
    const context = createContext();

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      handler,
      controllerClass,
    ]);
    expect(superCanActivate).not.toHaveBeenCalled();
  });

  it('delegates to the real passport-jwt guard when no @Public() metadata is present and no session', async () => {
    const getAllAndOverride = jest.fn().mockReturnValue(false);
    const reflector = { getAllAndOverride } as unknown as Reflector;
    const oidc = makeOidcService();
    const guard = new JwtAuthGuard(reflector, oidc);
    const superCanActivate = superCanActivateSpy().mockResolvedValue(true);
    const context = createContext();

    const result = await guard.canActivate(context);

    expect(superCanActivate).toHaveBeenCalledWith(context);
    expect(result).toBe(true);
  });

  it('authenticates from session when userId is present, setting req.user = { sub }', async () => {
    const getAllAndOverride = jest.fn().mockReturnValue(false);
    const reflector = { getAllAndOverride } as unknown as Reflector;
    const oidc = makeOidcService();
    const guard = new JwtAuthGuard(reflector, oidc);
    const superCanActivate = superCanActivateSpy();

    const context = createContext({ userId: 'session-sub' });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(superCanActivate).not.toHaveBeenCalled();
    // req.user must be populated so downstream handlers can read it.
    // getRequest() returns the same stable object reference used by the guard.
    const req = context.switchToHttp().getRequest<{ user: unknown }>();
    expect(req.user).toEqual({ sub: 'session-sub' });
  });

  it('refreshes the access token proactively when within 30 s of expiry', async () => {
    const getAllAndOverride = jest.fn().mockReturnValue(false);
    const reflector = { getAllAndOverride } as unknown as Reflector;
    const oidc = makeOidcService();
    const nowSeconds = Math.floor(Date.now() / 1000);
    oidc.refreshAccessToken.mockResolvedValueOnce({
      accessToken: 'new-at',
      refreshToken: 'new-rt',
      idToken: 'new-it',
      accessTokenExpiresAt: nowSeconds + 300,
    });

    const guard = new JwtAuthGuard(reflector, oidc);
    const session: Partial<BffSession> = {
      userId: 'sub',
      accessToken: 'old-at',
      refreshToken: 'old-rt',
      // 20 seconds remaining -- within the 30 s leeway window
      accessTokenExpiresAt: nowSeconds + 20,
    };
    const context = createContext(session);

    await guard.canActivate(context);

    expect(oidc.refreshAccessToken).toHaveBeenCalledWith('old-rt');
    // Session token must be updated after refresh.
    expect(session.accessToken).toBe('new-at');
    expect(session.refreshToken).toBe('new-rt');
  });

  it('does NOT refresh the access token when it is not close to expiry', async () => {
    const getAllAndOverride = jest.fn().mockReturnValue(false);
    const reflector = { getAllAndOverride } as unknown as Reflector;
    const oidc = makeOidcService();
    const nowSeconds = Math.floor(Date.now() / 1000);

    const guard = new JwtAuthGuard(reflector, oidc);
    const context = createContext({
      userId: 'sub',
      accessToken: 'at',
      refreshToken: 'rt',
      // 120 seconds remaining -- well outside the 30 s leeway window
      accessTokenExpiresAt: nowSeconds + 120,
    });

    await guard.canActivate(context);

    expect(oidc.refreshAccessToken).not.toHaveBeenCalled();
  });

  it('destroys the session and throws UnauthorizedException when refresh fails', async () => {
    const getAllAndOverride = jest.fn().mockReturnValue(false);
    const reflector = { getAllAndOverride } as unknown as Reflector;
    const oidc = makeOidcService();
    oidc.refreshAccessToken.mockRejectedValueOnce(new Error('Keycloak down'));
    const nowSeconds = Math.floor(Date.now() / 1000);

    const guard = new JwtAuthGuard(reflector, oidc);

    // Use `createContext` so `getRequest()` returns a stable reference.
    const context = createContext({
      userId: 'sub',
      accessToken: 'at',
      refreshToken: 'rt',
      accessTokenExpiresAt: nowSeconds + 10,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    // `session.destroy` was added to the session object by createContext -- assert via getRequest.
    const req = context
      .switchToHttp()
      .getRequest<{ session: { destroy: jest.Mock } }>();
    expect(req.session.destroy).toHaveBeenCalled();
  });
});
