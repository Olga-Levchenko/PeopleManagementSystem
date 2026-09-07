import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { SessionData } from 'express-session';
import { generators } from 'openid-client';
import { OidcService } from './oidc.service';
import { Public } from './public.decorator';
import type { BffSession } from './session.types';

/**
 * Five BFF-owned OIDC lifecycle endpoints:
 *  GET  /api/v1/auth/login              — initiate PKCE flow
 *  GET  /api/v1/auth/callback           — receive authorization code from Keycloak
 *  POST /api/v1/auth/logout             — sign out (destroy session + Keycloak SSO)
 *  POST /api/v1/auth/backchannel-logout — Keycloak-initiated back-channel logout
 *  GET  /api/v1/auth/me                 — return session identity
 *
 * All endpoints except `/me` are `@Public()` (no JWT guard). `/me` validates via the session
 * check prepended in `JwtAuthGuard.canActivate`, not via a bearer token.
 *
 * Tokens are never returned in a response body, URL parameter, or fragment -- they live
 * exclusively in the server-side session.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly oidc: OidcService,
    private readonly config: ConfigService,
  ) {}

  // ---------- GET /auth/login ----------

  @Public()
  @Get('login')
  @ApiOperation({ summary: 'Initiate PKCE authorization-code flow' })
  login(@Req() req: Request, @Res() res: Response): void {
    const session = req.session as BffSession;

    // If already authenticated, skip Keycloak entirely.
    if (session.userId) {
      res.redirect('/');
      return;
    }

    const state = generators.state();
    const { verifier, challenge } = this.oidc.generatePkce();
    const redirectUri = this.config.getOrThrow<string>('OIDC_CALLBACK_URL');

    // Store PKCE artifacts and state in the session before redirecting so the callback can
    // validate them. The session is saved implicitly by express-session on redirect.
    session.oidcState = state;
    session.oidcVerifier = verifier;

    const authUrl = this.oidc.buildAuthorizationUrl(
      state,
      challenge,
      redirectUri,
    );
    res.redirect(authUrl);
  }

  // ---------- GET /auth/callback ----------

  @Public()
  @Get('callback')
  @ApiOperation({
    summary: 'Keycloak OIDC callback — exchange code for tokens',
  })
  async callback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const session = req.session as BffSession;
    const query = req.query as Record<string, string | undefined>;
    const { state, code } = query;

    if (!state || !code) {
      throw new BadRequestException('Missing state or code in callback query.');
    }

    // A callback replay (e.g. browser Back button after successful login) arrives with the
    // same URL but the session's oidcState was already cleared by the first exchange. If the
    // session is already authenticated just redirect to the frontend -- the original exchange
    // succeeded and no second code-exchange is needed. Only throw on a genuine state mismatch
    // (oidcState set but doesn't match -- real CSRF signal).
    if (!session.oidcState) {
      const frontendUrl = this.config.getOrThrow<string>('CORS_ORIGIN');
      if (session.userId) {
        res.redirect(frontendUrl);
        return;
      }
      throw new BadRequestException(
        'State mismatch — possible CSRF; request rejected.',
      );
    }

    if (session.oidcState !== state) {
      throw new BadRequestException(
        'State mismatch — possible CSRF; request rejected.',
      );
    }

    const verifier = session.oidcVerifier;
    if (!verifier) {
      throw new BadRequestException('PKCE verifier missing from session.');
    }

    // Clear transient OIDC artifacts before storing real session data so they don't linger
    // even if the exchange throws below.
    session.oidcState = undefined;
    session.oidcVerifier = undefined;

    // Forward all string-valued callback params (code, iss, state, session_state, …) so
    // openid-client can validate the iss response parameter (RFC 9207). Keycloak 24+ includes
    // iss in the redirect; passing only { code } causes RPError: iss missing from the response.
    const callbackParams: Record<string, string> = {};
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === 'string') callbackParams[key] = value;
    }

    const redirectUri = this.config.getOrThrow<string>('OIDC_CALLBACK_URL');

    try {
      const tokens = await this.oidc.exchangeCode(callbackParams, redirectUri, verifier);

      session.userId = tokens.sub;
      session.email = tokens.email;
      session.accessToken = tokens.accessToken;
      session.refreshToken = tokens.refreshToken;
      session.idToken = tokens.idToken;
      session.accessTokenExpiresAt = tokens.accessTokenExpiresAt;

      const frontendUrl = this.config.getOrThrow<string>('CORS_ORIGIN');
      res.redirect(frontendUrl);
    } catch (err) {
      this.logger.error('OIDC code exchange failed', err);
      throw new InternalServerErrorException(
        'Authentication failed; please try again.',
      );
    }
  }

  // ---------- POST /auth/logout ----------

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.FOUND)
  @ApiOperation({ summary: 'Sign out — destroy session and end Keycloak SSO' })
  logout(@Req() req: Request, @Res() res: Response): void {
    const session = req.session as BffSession;
    const idToken = session.idToken;

    // Destroy the local session first -- even if Keycloak is unreachable, the user is signed out
    // of this BFF. Cookie is cleared by express-session destroy().
    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        this.logger.error('Session destroy failed during logout', destroyErr);
      }

      // Best-effort Keycloak SSO termination -- fire-and-forget, redirect regardless.
      if (idToken) {
        void this.oidc
          .endSession(idToken)
          .then((endSessionUrl) => {
            if (endSessionUrl) {
              res.redirect(endSessionUrl);
            } else {
              res.redirect('/login');
            }
          })
          .catch((err) => {
            this.logger.warn(
              'Keycloak end_session call failed (session already destroyed locally)',
              err,
            );
            res.redirect('/login');
          });
      } else {
        res.redirect('/login');
      }
    });
  }

  // ---------- POST /auth/backchannel-logout ----------

  @Public()
  @Post('backchannel-logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Keycloak back-channel logout — invalidate matching BFF session',
  })
  async backchannelLogout(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Keycloak sends the logout_token as a form-urlencoded body field.
    const logoutToken: string | undefined = (
      req.body as Record<string, unknown>
    )?.logout_token as string | undefined;

    if (!logoutToken || typeof logoutToken !== 'string') {
      throw new BadRequestException('Missing logout_token in request body.');
    }

    let parsedToken: { sub: string; sid?: string };
    try {
      parsedToken = await this.oidc.validateLogoutToken(logoutToken);
    } catch (err) {
      this.logger.warn('Back-channel logout token validation failed', err);
      throw new BadRequestException('Invalid logout_token.');
    }

    this.logger.log(
      `Back-channel logout received for sub=${parsedToken.sub} sid=${parsedToken.sid ?? 'n/a'}`,
    );

    // Scan the session store for sessions belonging to this user and destroy each one.
    // express-session's Store.all() returns { [sid]: sessionData } for all active sessions.
    // The lookup is O(sessions) but back-channel logout is a rare operation -- no separate
    // userId/sid index is needed at this scale. With MemoryStore (local dev) this still works
    // but all sessions reset on BFF restart anyway; the real value is with connect-pg-simple
    // where sessions survive restarts and a real scan+destroy is required.
    await new Promise<void>((resolve) => {
      if (!req.sessionStore?.all) {
        // Store does not implement .all() -- log and continue without destroying sessions.
        this.logger.warn(
          'Session store does not support .all() -- back-channel logout cannot destroy sessions.',
        );
        resolve();
        return;
      }

      req.sessionStore.all(
        (
          err: unknown,
          rawSessions?: SessionData[] | Record<string, SessionData> | null,
        ) => {
          if (err || rawSessions == null) {
            this.logger.warn(
              'Back-channel logout: failed to enumerate sessions',
              err,
            );
            resolve();
            return;
          }

          // Store.all() may return either a { [sid]: SessionData } dict or a SessionData[] array.
          // MemoryStore and connect-pg-simple both return the dict form. If a store returns the
          // array form, we cannot scan by sid key — log and skip rather than silently discarding.
          if (Array.isArray(rawSessions)) {
            this.logger.warn(
              'Back-channel logout: session store returned array form — cannot scan by userId; skipping destruction.',
            );
            resolve();
            return;
          }
          const sessions: Record<string, SessionData> = rawSessions;

          const targetSub = parsedToken.sub;
          const matchingSids = Object.entries(sessions)
            .filter(
              ([, sessionData]) =>
                targetSub && sessionData.userId === targetSub,
            )
            .map(([sid]) => sid);

          if (matchingSids.length === 0) {
            resolve();
            return;
          }

          let remaining = matchingSids.length;
          for (const sid of matchingSids) {
            try {
              req.sessionStore.destroy(sid, (destroyErr) => {
                if (destroyErr) {
                  this.logger.warn(
                    `Back-channel logout: failed to destroy session ${sid}`,
                    destroyErr,
                  );
                }
                remaining -= 1;
                if (remaining === 0) {
                  resolve();
                }
              });
            } catch (syncErr) {
              this.logger.warn(
                `Back-channel logout: store.destroy(${sid}) threw synchronously`,
                syncErr,
              );
              remaining -= 1;
              if (remaining === 0) {
                resolve();
              }
            }
          }
        },
      );
    });

    res.sendStatus(HttpStatus.OK);
  }

  // ---------- GET /auth/me ----------

  @Get('me')
  @ApiOperation({ summary: 'Return session identity (sub + email)' })
  me(@Req() req: Request): { sub: string; email: string | undefined } {
    // `req.user` is set by JwtAuthGuard.canActivate's session-check branch before this
    // handler runs. If the session is absent or expired, the guard returns 401 before reaching here.
    const user = req.user as { sub: string } | undefined;

    if (!user?.sub) {
      throw new UnauthorizedException();
    }

    const session = req.session as BffSession;
    return { sub: user.sub, email: session.email };
  }
}
