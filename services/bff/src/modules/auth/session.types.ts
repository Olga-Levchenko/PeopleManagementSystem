import 'express-session';

/**
 * BFF server-side session shape. Tokens are stored here exclusively -- they are never sent to the
 * browser in a response body, URL parameter, or fragment. `express-session` serialises this to the
 * session store (MemoryStore in local dev; connect-redis/connect-pg-simple in production).
 *
 * Transient OIDC handshake fields (`oidcState`, `oidcVerifier`) are set during the `/login`
 * redirect and cleared immediately on `/callback` -- whether the exchange succeeds or not.
 */
export interface BffSession {
  /** Keycloak subject (`sub` claim) -- present only when the user is authenticated. */
  userId?: string;
  /** User email from the ID token claims -- stored for the `/me` endpoint. */
  email?: string;
  /** Opaque CSRF-protection value stored during `/login` and verified on `/callback`. */
  oidcState?: string;
  /** PKCE code verifier stored during `/login` and consumed by `/callback`. */
  oidcVerifier?: string;
  /** Keycloak access token -- injected as `Authorization: Bearer` on outbound domain calls. */
  accessToken?: string;
  /** Keycloak refresh token -- used to silently renew the access token. */
  refreshToken?: string;
  /** Keycloak ID token -- used as `id_token_hint` on the end_session call. */
  idToken?: string;
  /**
   * Unix epoch seconds when the access token expires (`exp` claim). Stored alongside the token so
   * `JwtAuthGuard` can proactively refresh within 30 s of expiry without decoding the JWT on every
   * request. `undefined` if the tokenSet did not include an `expires_at` (shouldn't happen with
   * Keycloak but is technically optional per the OIDC spec).
   */
  accessTokenExpiresAt?: number;
}

/**
 * Module augmentation so TypeScript understands `req.session` carries `BffSession` fields
 * anywhere `express-session` types are imported alongside this file.
 *
 * The re-declaration of each optional field is intentional: an empty `extends BffSession` body
 * would trigger `@typescript-eslint/no-empty-object-type`, and a bare `interface SessionData`
 * without extending the right type would lose the built-in express-session fields. Repeating
 * the field names keeps the rule happy while preserving correct merging into `SessionData`.
 */
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    email?: string;
    oidcState?: string;
    oidcVerifier?: string;
    accessToken?: string;
    refreshToken?: string;
    idToken?: string;
    accessTokenExpiresAt?: number;
  }
}
