import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Issuer, TokenSet, type Client, generators } from 'openid-client';
import { deriveIssuer } from './jwt.strategy';

/**
 * A parsed, validated Keycloak logout token. The only claims the BFF cares about are `sub`
 * (which user the logout is for) and `sid` (the Keycloak session ID, used to correlate with the
 * BFF session stored in express-session). Both are always present in a well-formed Keycloak
 * back-channel logout token per the OIDC Back-Channel Logout spec.
 */
export interface LogoutToken {
  sub: string;
  sid?: string;
}

/**
 * Thin wrapper around `openid-client` for the BFF's PKCE authorization-code flow and session
 * lifecycle. This service is NOT an OIDC proxy -- it performs a one-time discovery on module
 * init and then reuses the discovered `Client`. Token storage, session management, and request
 * forwarding are the responsibility of `AuthController` and `JwtAuthGuard`.
 *
 * The `openid-client` v5 `Issuer.discover()` call is deferred to `onModuleInit` so the BFF still
 * starts (with a clear startup-time error) even if Keycloak is briefly unavailable during local
 * dev -- fail-fast at "first request" rather than "npm run start:dev" is an acceptable trade-off
 * for developer UX in this environment.
 */
@Injectable()
export class OidcService implements OnModuleInit {
  private readonly logger = new Logger(OidcService.name);
  private client!: Client;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const issuer = deriveIssuer(this.config);
    const clientId = 'bff-confidential';
    const clientSecret = this.config.getOrThrow<string>(
      'KEYCLOAK_CLIENT_SECRET',
    );

    try {
      const discovered = await Issuer.discover(issuer);
      this.client = new discovered.Client({
        client_id: clientId,
        client_secret: clientSecret,
        response_types: ['code'],
      });
      this.logger.log(`OIDC discovery complete for issuer: ${issuer}`);
    } catch (err) {
      // Log the failure so the startup error is visible, but don't crash the process: the BFF
      // can still serve health checks and other public routes. The first authenticated request
      // will fail with an InternalServerErrorException (see the guard on `this.client` below).
      this.logger.error('OIDC discovery failed on startup', err);
    }
  }

  /** Generates a PKCE verifier+challenge pair ready to attach to an authorization request. */
  generatePkce(): { verifier: string; challenge: string } {
    const verifier = generators.codeVerifier();
    const challenge = generators.codeChallenge(verifier);
    return { verifier, challenge };
  }

  /**
   * Builds the Keycloak authorization URL for the PKCE authorization-code flow.
   *
   * @param state Opaque value stored in session; validated on callback to prevent CSRF.
   * @param codeChallenge SHA-256 PKCE challenge derived from the stored verifier.
   * @param redirectUri The callback URL Keycloak redirects to after authorization.
   */
  buildAuthorizationUrl(
    state: string,
    codeChallenge: string,
    redirectUri: string,
  ): string {
    this.assertClientReady();
    return this.client.authorizationUrl({
      scope: 'openid email profile',
      state,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
  }

  /**
   * Exchanges an authorization code for tokens. Returns the full TokenSet so the caller can
   * store whichever claims it needs in the server-side session.
   */
  async exchangeCode(
    code: string,
    redirectUri: string,
    codeVerifier: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string | undefined;
    idToken: string | undefined;
    sub: string;
    email: string | undefined;
    accessTokenExpiresAt: number | undefined;
  }> {
    this.assertClientReady();

    const tokenSet = await this.client.callback(
      redirectUri,
      { code },
      { code_verifier: codeVerifier },
    );

    const claims = tokenSet.claims();

    return {
      accessToken: tokenSet.access_token ?? '',
      refreshToken: tokenSet.refresh_token,
      idToken: tokenSet.id_token,
      sub: claims.sub,
      email: typeof claims.email === 'string' ? claims.email : undefined,
      accessTokenExpiresAt: tokenSet.expires_at,
    };
  }

  /**
   * Uses the stored refresh token to obtain a fresh access token. Returns updated token
   * fields so the caller can update the session.
   */
  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string | undefined;
    idToken: string | undefined;
    accessTokenExpiresAt: number | undefined;
  }> {
    this.assertClientReady();

    const tokenSet = await this.client.refresh(refreshToken);

    return {
      accessToken: tokenSet.access_token ?? '',
      refreshToken: tokenSet.refresh_token,
      idToken: tokenSet.id_token,
      accessTokenExpiresAt: tokenSet.expires_at,
    };
  }

  /**
   * Calls Keycloak's `end_session_endpoint` to terminate the SSO session. This is a best-effort
   * call -- callers must destroy the local BFF session regardless of whether this succeeds
   * (e.g. Keycloak temporarily unreachable).
   */
  endSession(
    idToken: string | undefined,
    redirectUri?: string,
  ): Promise<string | undefined> {
    this.assertClientReady();

    if (!this.client.issuer.metadata.end_session_endpoint) {
      this.logger.warn(
        'Keycloak end_session_endpoint not discovered; skipping SSO logout',
      );
      return Promise.resolve(undefined);
    }

    return Promise.resolve(
      this.client.endSessionUrl({
        id_token_hint: idToken,
        post_logout_redirect_uri: redirectUri,
      }),
    );
  }

  /**
   * Validates a Keycloak back-channel `logout_token` JWT (OIDC Back-Channel Logout spec §2.4).
   * Uses the same JWKS already fetched by `openid-client` during discovery -- no second fetcher.
   * Returns the parsed token claims so the caller can match the session to destroy.
   */
  async validateLogoutToken(logoutToken: string): Promise<LogoutToken> {
    this.assertClientReady();

    // `openid-client` v5 exposes `validateLogoutToken` on the Client instance at runtime, but the
    // @types/openid-client declaration file types every non-enumerated property on BaseClient as
    // `unknown` (via `[key: string]: unknown`). We access it via bracket notation and narrow the
    // type manually to avoid an `unknown`-typed call.
    const validateFn = this.client['validateLogoutToken'] as (
      token: string,
    ) => Promise<TokenSet>;
    if (typeof validateFn !== 'function') {
      throw new InternalServerErrorException(
        'openid-client Client.validateLogoutToken is not available -- check library version.',
      );
    }
    const tokenSet = await validateFn.call(this.client, logoutToken);
    const claims = tokenSet.claims();

    return {
      sub: claims.sub,
      sid: typeof claims.sid === 'string' ? claims.sid : undefined,
    };
  }

  private assertClientReady(): void {
    if (!this.client) {
      throw new InternalServerErrorException(
        'OIDC client is not initialised -- discovery may have failed at startup. Check logs.',
      );
    }
  }
}
