import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { passportJwtSecret } from 'jwks-rsa';
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';

/**
 * This is `bff-confidential`'s own client id -- also the `included.client.audience` value baked
 * into that client's `bff-confidential-audience` protocol mapper in
 * `authentication-service/keycloak/realm-export.json` (the single source of truth for this
 * realm). Kept as a constant, not an env var: unlike `KEYCLOAK_BASE_URL`/`KEYCLOAK_REALM`, this
 * value never varies per environment -- it names a specific client, not a deployment topology.
 * `people-service` validates the same audience as the BFF because it re-verifies the identical
 * bearer token the browser obtained and the BFF forwards unchanged (see this module's own
 * `auth.module.ts` doc comment) -- it is not a second, different client.
 */
const BFF_CLIENT_ID = 'bff-confidential';

/**
 * The subset of a Keycloak-issued access token's claims this strategy reads. Only `sub` is ever
 * used (see `validate` below) -- this interface exists purely so `payload` isn't `any`.
 */
export interface JwtPayload {
  sub: string;
  [claim: string]: unknown;
}

/**
 * The shape attached to `request.user` once a token passes validation. Deliberately minimal: no
 * role/permission claim from the token is ever exposed here, per the design guardrail logged in
 * `deferred-work.md` from Story 1.11's first slice -- access roles and functional-role
 * permissions are resolved by `access-control-service`, never sourced from Keycloak claims.
 */
export interface AuthenticatedUser {
  sub: string;
}

/**
 * Derives this realm's OIDC issuer from `KEYCLOAK_BASE_URL`/`KEYCLOAK_REALM` using the exact same
 * formula as `authentication-service`'s `AppConfig.Issuer` (see that class's doc comment) and the
 * BFF's own `deriveIssuer` (`services/bff/src/modules/auth/jwt.strategy.ts`) -- a deliberate
 * duplication, not a live discovery call, so this service stays startable independent of
 * `authentication-service`'s own uptime. `KEYCLOAK_BASE_URL` is trimmed of any trailing slash
 * first, matching `AppConfig.Load`'s own trim -- a copy-pasted value with one would otherwise
 * double up in this derived URL (and in `deriveJwksUri`'s below it).
 */
export function deriveIssuer(config: ConfigService): string {
  const baseUrl = config
    .getOrThrow<string>('KEYCLOAK_BASE_URL')
    .replace(/\/+$/, '');
  const realm = config.getOrThrow<string>('KEYCLOAK_REALM');
  return `${baseUrl}/realms/${realm}`;
}

/** Mirrors `AppConfig.JwksUri`'s derivation: `{issuer}/protocol/openid-connect/certs`. */
export function deriveJwksUri(issuer: string): string {
  return `${issuer}/protocol/openid-connect/certs`;
}

/**
 * Validates a bearer token's signature against Keycloak's real JWKS (via `jwks-rsa`, cached and
 * rate-limited) and its `iss` claim against this realm's real issuer. Never reads a role/
 * permission claim -- see `AuthenticatedUser` above.
 *
 * This is `people-service`'s own, independent re-verification of the same token the BFF already
 * validated at the edge (Story 1.11b) -- the first "trusted service-to-service identity" hop in
 * this platform (`deferred-work.md`'s 1-11c entry). `people-service` never trusts a forwarded
 * `request.user` or a caller-supplied `actorId`; it verifies the signature/issuer/audience itself,
 * exactly as the BFF does.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const issuer = deriveIssuer(config);
    const options: StrategyOptions = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: deriveJwksUri(issuer),
      }),
      issuer,
      audience: BFF_CLIENT_ID,
      algorithms: ['RS256'],
      // Small leeway against real clock drift between this process and Keycloak's -- without it,
      // a token that is genuinely still valid can be spuriously rejected as expired/not-yet-valid
      // whenever the two clocks disagree by even a couple of seconds (a real risk across separate
      // containers/machines in CI or production, not just a local-dev nicety). passport-jwt's
      // StrategyOptions has no top-level `clockTolerance` -- jsonwebtoken's own VerifyOptions
      // (which does) must be passed through its `jsonWebTokenOptions` escape hatch.
      jsonWebTokenOptions: {
        clockTolerance: 5,
      },
    };
    super(options);
  }

  /**
   * Called by Passport only after signature/issuer/audience/algorithm/expiration have already
   * been verified by `passport-jwt`. Returns exactly `{ sub }` -- nothing else from `payload` is
   * ever forwarded onto `request.user`, per this story's frozen boundary. Rejects a token with no
   * (or blank) `sub` claim outright -- a signature-valid token carrying no usable identity must
   * not be treated as "authenticated".
   */
  validate(payload: JwtPayload): AuthenticatedUser {
    if (typeof payload.sub !== 'string' || payload.sub.trim().length === 0) {
      throw new UnauthorizedException('Token is missing a sub claim.');
    }
    return { sub: payload.sub };
  }
}
