import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key `JwtAuthGuard` looks for via `Reflector` to short-circuit the global guard.
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route handler (or an entire controller) as exempt from the global `JwtAuthGuard`
 * (registered as `APP_GUARD` in `AppModule`). Every route is protected by default; a route opts
 * OUT via this decorator, never the other way around. Only `/health` uses this today.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
