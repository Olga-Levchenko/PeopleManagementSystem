import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPrivateKey, createPublicKey, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Issuer, type Client, generators } from 'openid-client';
import { deriveIssuer } from './jwt.strategy';
import type { BffSession } from './session.types';

export const BACKEND_AUDIENCES = [
  'people-service',
  'access-control-service',
] as const;
export type BackendAudience = (typeof BACKEND_AUDIENCES)[number];
const BACKEND_AUDIENCE_SCOPES: Record<BackendAudience, string> = {
  'people-service': 'people-service-audience',
  'access-control-service': 'access-control-service-audience',
};
const BFF_CLIENT_ID = 'bff-confidential';
const BACKCHANNEL_LOGOUT_EVENT =
  'http://schemas.openid.net/event/backchannel-logout';

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
  private publicJwk?: Record<string, unknown>;
  private issuerUrl?: string;
  private logoutJwksUri?: string;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const issuer = deriveIssuer(this.config);
    const clientId = 'bff-confidential';
    const privateKeyPath = this.config.getOrThrow<string>(
      'KEYCLOAK_CLIENT_PRIVATE_KEY_PATH',
    );
    const keyId = this.config.getOrThrow<string>('KEYCLOAK_CLIENT_KEY_ID');
    const signingAlgorithm = this.config.getOrThrow<string>(
      'KEYCLOAK_CLIENT_AUTH_SIGNING_ALG',
    );

    try {
      const discovered = await Issuer.discover(issuer);
      this.issuerUrl = issuer;
      this.logoutJwksUri = discovered.metadata.jwks_uri;
      const privateKey = createPrivateKey(await readFile(privateKeyPath));
      const privateJwk = privateKey.export({ format: 'jwk' }) as Record<
        string,
        unknown
      >;
      privateJwk.kid = keyId;
      privateJwk.alg = signingAlgorithm;
      privateJwk.use = 'sig';

      const publicJwk = createPublicKey(privateKey).export({
        format: 'jwk',
      }) as Record<string, unknown>;
      publicJwk.kid = keyId;
      publicJwk.alg = signingAlgorithm;
      publicJwk.use = 'sig';
      this.publicJwk = publicJwk;

      const clientJwks = JSON.parse(
        JSON.stringify({ keys: [privateJwk] }),
      ) as ConstructorParameters<typeof discovered.Client>[1];
      this.client = new discovered.Client(
        {
          client_id: clientId,
          token_endpoint_auth_method: 'private_key_jwt',
          token_endpoint_auth_signing_alg: signingAlgorithm,
          response_types: ['code'],
        },
        clientJwks,
      );
      this.logger.log(`OIDC discovery complete for issuer: ${issuer}`);
    } catch (err) {
      // Keep startup behavior unchanged: health and public routes remain available. Any
      // authenticated OIDC or token-exchange operation fails closed until the key provider is
      // available.
      this.logger.error('OIDC client initialisation failed on startup', err);
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
   *
   * `callbackParams` must be the full set of query parameters received in the Keycloak redirect
   * (code, iss, state, session_state, …). openid-client v5 validates the `iss` response
   * parameter (RFC 9207) and throws `RPError: iss missing from the response` when only `{ code }`
   * is forwarded and Keycloak 24+ includes `iss` in the redirect.
   */
  async exchangeCode(
    callbackParams: Record<string, string>,
    redirectUri: string,
    codeVerifier: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string | undefined;
    idToken: string | undefined;
    sub: string;
    email: string | undefined;
    oidcSessionId: string | undefined;
    accessTokenExpiresAt: number | undefined;
  }> {
    this.assertClientReady();

    const tokenSet = await this.client.callback(
      redirectUri,
      callbackParams,
      {
        code_verifier: codeVerifier,
        state: callbackParams.state,
      },
      { clientAssertionPayload: this.clientAssertionPayload() },
    );

    const claims = tokenSet.claims();
    let email = typeof claims.email === 'string' ? claims.email : undefined;
    if (!email && tokenSet.access_token) {
      const userInfo = await this.client.userinfo(tokenSet.access_token);
      email = typeof userInfo.email === 'string' ? userInfo.email : undefined;
    }

    return {
      accessToken: tokenSet.access_token ?? '',
      refreshToken: tokenSet.refresh_token,
      idToken: tokenSet.id_token,
      sub: claims.sub,
      email,
      oidcSessionId: typeof claims.sid === 'string' ? claims.sid : undefined,
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

    const tokenSet = await this.client.refresh(refreshToken, {
      clientAssertionPayload: this.clientAssertionPayload(),
    });

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

    if (!this.issuerUrl || !this.logoutJwksUri) {
      throw new InternalServerErrorException(
        'OIDC logout-token validation is not configured.',
      );
    }

    const [encodedHeader, encodedPayload, encodedSignature] =
      logoutToken.split('.');
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      throw new Error('Malformed logout token.');
    }

    const header = JSON.parse(
      Buffer.from(encodedHeader, 'base64url').toString('utf8'),
    ) as { alg?: string; kid?: string };
    if (header.alg !== 'RS256' || !header.kid) {
      throw new Error('Unsupported logout token signature.');
    }

    const jwksResponse = await fetch(this.logoutJwksUri);
    if (!jwksResponse.ok) {
      throw new Error('OIDC JWKS request failed.');
    }
    const jwks = (await jwksResponse.json()) as {
      keys?: Array<Record<string, unknown>>;
    };
    const jwk = jwks.keys?.find((key) => key.kid === header.kid);
    if (!jwk) {
      throw new Error('Logout token signing key was not found.');
    }

    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const isValidSignature = verify(
      'RSA-SHA256',
      Buffer.from(signingInput),
      createPublicKey({ key: jwk, format: 'jwk' }),
      Buffer.from(encodedSignature, 'base64url'),
    );
    if (!isValidSignature) {
      throw new Error('Invalid logout token signature.');
    }

    const claims = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as {
      iss?: string;
      aud?: string | string[];
      events?: Record<string, unknown>;
      nonce?: unknown;
      sub?: unknown;
      sid?: unknown;
      exp?: unknown;
      iat?: unknown;
    };
    const now = Math.floor(Date.now() / 1000);
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (
      claims.iss !== this.issuerUrl ||
      !audiences.includes(BFF_CLIENT_ID) ||
      !claims.events?.[BACKCHANNEL_LOGOUT_EVENT] ||
      claims.nonce !== undefined ||
      typeof claims.sub !== 'string' ||
      typeof claims.exp !== 'number' ||
      claims.exp <= now ||
      typeof claims.iat !== 'number' ||
      claims.iat > now + 60
    ) {
      throw new Error('Invalid logout token claims.');
    }

    return {
      sub: claims.sub,
      sid: typeof claims.sid === 'string' ? claims.sid : undefined,
    };
  }

  async exchangeForAudience(
    subjectToken: string,
    audience: BackendAudience,
  ): Promise<string> {
    if (!BACKEND_AUDIENCES.includes(audience)) {
      throw new ServiceUnavailableException(
        'Requested token audience is not allowed.',
      );
    }

    try {
      this.assertClientReady();
      const tokenSet = await this.client.grant(
        {
          grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
          subject_token: subjectToken,
          subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
          requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
          audience,
          scope: BACKEND_AUDIENCE_SCOPES[audience],
        },
        { clientAssertionPayload: this.clientAssertionPayload() },
      );

      if (
        !tokenSet.access_token ||
        !tokenSet.expires_at ||
        tokenSet.expires_at <= Math.floor(Date.now() / 1000)
      ) {
        throw new Error(
          'Keycloak returned no valid short-lived exchanged access token.',
        );
      }

      return tokenSet.access_token;
    } catch (err) {
      this.logger.warn('Keycloak token exchange failed', err);
      throw new ServiceUnavailableException(
        'Token exchange service is unavailable.',
      );
    }
  }

  getPublicJwks(): { keys: Record<string, unknown>[] } {
    if (!this.publicJwk) {
      throw new ServiceUnavailableException(
        'Private signing key is unavailable.',
      );
    }

    return { keys: [this.publicJwk] };
  }

  async resolveAuthorization(
    session: BffSession | undefined,
    incomingAuthorization: string | undefined,
    audience: BackendAudience,
  ): Promise<string | undefined> {
    if (!session?.userId) {
      if (!incomingAuthorization) {
        return undefined;
      }
      const subjectToken = incomingAuthorization
        .replace(/^Bearer\s+/i, '')
        .trim();
      if (!subjectToken) {
        throw new ServiceUnavailableException(
          'Authenticated request has no usable access token.',
        );
      }
      const exchangedToken = await this.exchangeForAudience(
        subjectToken,
        audience,
      );
      return `Bearer ${exchangedToken}`;
    }

    if (!session.accessToken) {
      throw new ServiceUnavailableException(
        'Authenticated session has no access token.',
      );
    }

    const exchangedToken = await this.exchangeForAudience(
      session.accessToken,
      audience,
    );
    return `Bearer ${exchangedToken}`;
  }

  private clientAssertionPayload(): {
    aud: string;
    exp: number;
    iat: number;
    jti: string;
  } {
    this.assertClientReady();

    const tokenEndpoint = this.client.issuer.metadata.token_endpoint;
    if (!tokenEndpoint) {
      throw new ServiceUnavailableException(
        'Keycloak token endpoint is unavailable.',
      );
    }

    const iat = Math.floor(Date.now() / 1000);
    return {
      aud: tokenEndpoint,
      exp: iat + 60,
      iat,
      jti: generators.random(),
    };
  }

  private assertClientReady(): void {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'OIDC client is not initialised -- discovery may have failed at startup. Check logs.',
      );
    }
  }
}
