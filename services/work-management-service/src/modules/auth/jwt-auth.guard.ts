import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * The global guard (registered as `APP_GUARD` in `AppModule`) protecting every `people-service`
 * route by default, mirroring the BFF's own `JwtAuthGuard`
 * (`services/bff/src/modules/auth/jwt-auth.guard.ts`). A route opts OUT via `@Public()`, checked
 * here through `Reflector` before deferring to the real `passport-jwt` strategy for every other
 * route.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }
}
