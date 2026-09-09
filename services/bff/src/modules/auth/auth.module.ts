import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { OidcService } from './oidc.service';

/**
 * Wires the BFF's authentication layer:
 * - `JwtStrategy` (`passport-jwt`) validates bearer tokens against Keycloak's real JWKS/issuer.
 * - `OidcService` wraps `openid-client` for the PKCE authorization-code flow, token refresh,
 *   end_session, and back-channel logout-token validation.
 * - `AuthController` exposes the OIDC lifecycle endpoints (/login, /callback, /logout,
 *   /backchannel-logout, /jwks, /me).
 *
 * `JwtAuthGuard` is deliberately NOT provided/exported here -- `AppModule` registers it directly
 * as `{ provide: APP_GUARD, useClass: JwtAuthGuard }`, which makes Nest's root injector
 * instantiate its own instance (resolving `Reflector` from Nest core, which is always available
 * globally, not from this module). Providing/exporting a second copy here would be dead code:
 * nothing ever resolves `JwtAuthGuard` through `AuthModule`'s own injector.
 */
@Module({
  imports: [PassportModule],
  controllers: [AuthController],
  providers: [JwtStrategy, OidcService],
  exports: [JwtStrategy, OidcService],
})
export class AuthModule {}
