import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';

/**
 * Wires `people-service`'s JWT authentication: the `passport-jwt` strategy, validated against
 * Keycloak's real JWKS/issuer -- the identical pattern the BFF already built and reviewed
 * (`services/bff/src/modules/auth/auth.module.ts`), ported here so this service independently
 * re-verifies the same bearer token the BFF forwards unchanged, rather than trusting a forwarded
 * header or a caller-supplied `actorId`. `JwtAuthGuard` is deliberately NOT provided/exported here
 * -- `AppModule` registers it directly as `{ provide: APP_GUARD, useClass: JwtAuthGuard }`, which
 * makes Nest's root injector instantiate its own instance (resolving `Reflector` from Nest core,
 * which is always available globally, not from this module). Providing/exporting a second copy
 * here would be dead code: nothing ever resolves `JwtAuthGuard` through `AuthModule`'s own
 * injector.
 */
@Module({
  imports: [PassportModule],
  providers: [JwtStrategy],
  exports: [JwtStrategy],
})
export class AuthModule {}
