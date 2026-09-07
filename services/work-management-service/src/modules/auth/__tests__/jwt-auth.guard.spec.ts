import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../public.decorator';
import { JwtAuthGuard } from '../jwt-auth.guard';

describe('JwtAuthGuard', () => {
  // Same handler/class reference on every call -- Reflector.getAllAndOverride is asserted against
  // these exact references, and two separately-created anonymous functions/classes are never
  // considered equal by Jest's argument matching.
  const handler = function whoami() {};
  const controllerClass = class ProbeController {};

  function createContext(): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => controllerClass,
    } as unknown as ExecutionContext;
  }

  function superCanActivateSpy() {
    // JwtAuthGuard extends AuthGuard('jwt') -- the mixin class captured at this file's own
    // class-definition time. Spying on the prototype one level up from JwtAuthGuard.prototype
    // targets that exact base class, not a freshly-minted AuthGuard('jwt') from calling it again
    // here (which would be a different class entirely).
    return jest.spyOn(
      Object.getPrototypeOf(JwtAuthGuard.prototype),
      'canActivate',
    );
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('bypasses passport entirely when @Public() metadata is present, without calling the parent guard', () => {
    // Captured as its own local rather than read back off `reflector.getAllAndOverride` in the
    // assertion below -- referencing a real class's method by property access (even on an object
    // built via `as unknown as Reflector`) trips @typescript-eslint/unbound-method, since the
    // static type doesn't know it's actually a jest.fn() at runtime.
    const getAllAndOverride = jest.fn().mockReturnValue(true);
    const reflector = { getAllAndOverride } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);
    const superCanActivate = superCanActivateSpy();
    const context = createContext();

    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      handler,
      controllerClass,
    ]);
    expect(superCanActivate).not.toHaveBeenCalled();
  });

  it('delegates to the real passport-jwt guard when no @Public() metadata is present', () => {
    const getAllAndOverride = jest.fn().mockReturnValue(false);
    const reflector = { getAllAndOverride } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);
    const superCanActivate = superCanActivateSpy().mockReturnValue(true);
    const context = createContext();

    const result = guard.canActivate(context);

    expect(superCanActivate).toHaveBeenCalledWith(context);
    expect(result).toBe(true);
  });

  it('delegates to the real passport-jwt guard when @Public() metadata is entirely absent (undefined) -- the actual default state of every real protected route', () => {
    // `Reflector.getAllAndOverride` returns `undefined`, not `false`, when no @Public() decorator
    // was ever applied anywhere in the handler/class chain -- the explicit-`false` case above
    // covers a decorator that is present but set false, which never actually happens in this
    // codebase (@Public() only ever sets `true`, never `false`). This is the case every real
    // protected route hits.
    const getAllAndOverride = jest.fn().mockReturnValue(undefined);
    const reflector = { getAllAndOverride } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);
    const superCanActivate = superCanActivateSpy().mockReturnValue(true);
    const context = createContext();

    const result = guard.canActivate(context);

    expect(superCanActivate).toHaveBeenCalledWith(context);
    expect(result).toBe(true);
  });
});
