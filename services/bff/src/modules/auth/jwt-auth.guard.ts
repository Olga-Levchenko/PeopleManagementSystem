import {
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import type { BffSession } from './session.types';
import { IS_PUBLIC_KEY } from './public.decorator';
import { OidcService } from './oidc.service';

/**
 * Seconds before `accessTokenExpiresAt` at which the guard will proactively refresh the access
 * token. 30 s is intentionally generous: it covers typical clock-skew between the BFF and
 * Keycloak while leaving plenty of time for downstream services to accept the new token.
 */
const REFRESH_LEEWAY_SECONDS = 30;

/**
 * The global guard (registered as `APP_GUARD` in `AppModule`) protecting every BFF route by
 * default (AD-5). Evaluation order:
 *
 *   1. `@Public()` opt-out check — bypass Passport entirely for routes that declare it.
 *   2. Session check — if `req.session.userId` is set, assign `req.user = { sub }` and return
 *      `true` (no bearer token required). Also proactively refreshes the access token when it is
 *      within `REFRESH_LEEWAY_SECONDS` of expiry, so forwarded domain calls always carry a valid
 *      token.
 *   3. No session — reject the browser request; backend audience-specific credentials are
 *      acquired server-side from the validated session and are never accepted from the browser.
 *
 * A route opts OUT via `@Public()` (`modules/auth/public.decorator.ts`), never the other way
 * around; only `/health` and the five auth endpoints use it.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly oidcService: OidcService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const session = request.session as BffSession;

    if (session.userId) {
      // Proactively refresh the access token if it is within the leeway window of expiry.
      if (session.accessTokenExpiresAt !== undefined && session.refreshToken) {
        const nowSeconds = Math.floor(Date.now() / 1000);
        if (
          session.accessTokenExpiresAt - nowSeconds <=
          REFRESH_LEEWAY_SECONDS
        ) {
          try {
            const refreshed = await this.oidcService.refreshAccessToken(
              session.refreshToken,
            );
            session.accessToken = refreshed.accessToken;
            if (refreshed.refreshToken !== undefined) {
              session.refreshToken = refreshed.refreshToken;
            }
            if (refreshed.idToken !== undefined) {
              session.idToken = refreshed.idToken;
            }
            session.accessTokenExpiresAt = refreshed.accessTokenExpiresAt;
          } catch (err) {
            this.logger.warn(
              'Access token refresh failed; clearing session',
              err,
            );
            // Destroy the session so subsequent requests get a clean 401 rather than a loop of
            // failed refresh attempts.
            await new Promise<void>((resolve) =>
              request.session.destroy(() => resolve()),
            );
            throw new UnauthorizedException(
              'Session expired -- please sign in again.',
            );
          }
        }
      }

      // Attach a minimal user object so downstream handlers can read `req.user.sub`.
      (request as Request & { user: unknown }).user = { sub: session.userId };
      return true;
    }

    throw new UnauthorizedException('Authenticated session is required.');
  }
}
