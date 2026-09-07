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
    const { state, code } = req.query as Record<string, string | undefined>;

    if (!state || !code) {
      throw new BadRequestException('Missing state or code in callback query.');
    }

    if (!session.oidcState || session.oidcState !== state) {
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

    const redirectUri = this.config.getOrThrow<string>('OIDC_CALLBACK_URL');

    try {
      const tokens = await this.oidc.exchangeCode(code, redirectUri, verifier);

      session.userId = tokens.sub;
      session.email = tokens.email;
      session.accessToken = tokens.accessToken;
      session.refreshToken = tokens.refreshToken;
      session.idToken = tokens.idToken;
      session.accessTokenExpiresAt = tokens.accessTokenExpiresAt;

      res.redirect('/');
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

    // express-session's default MemoryStore does not expose a session-lookup-by-sub API -- we can
    // only match sessions we have access to. In the MemoryStore (local dev) back-channel logout
    // is best-effort: the token is validated and logged, but no session is destroyed (we lack the
    // session ID from the inbound request, and MemoryStore has no userId index).
    // Production must replace MemoryStore with connect-redis or connect-pg-simple and add an
    // index on userId/sid to support this -- documented in CLAUDE.md.
    this.logger.log(
      `Back-channel logout received for sub=${parsedToken.sub} sid=${parsedToken.sid ?? 'n/a'}`,
    );

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
