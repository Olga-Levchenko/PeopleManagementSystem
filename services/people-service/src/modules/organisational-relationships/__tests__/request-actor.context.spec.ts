import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { RequestActorContext } from '../request-actor.context';

interface AuthenticatedRequest extends Request {
  user?: {
    sub?: string;
  };
}

describe('RequestActorContext', () => {
  it('throws UnauthorizedException when request.user is absent', () => {
    const request = {} as AuthenticatedRequest;
    const context = new RequestActorContext(request);

    expect(() => context.actorId).toThrow(UnauthorizedException);
    expect(() => context.actorId).toThrow('Authenticated actor is required');
  });

  it('throws UnauthorizedException when request.user is present but sub is missing/blank', () => {
    const request = { user: { sub: '' } } as AuthenticatedRequest;
    const context = new RequestActorContext(request);

    expect(() => context.actorId).toThrow(UnauthorizedException);
  });

  it('returns request.user.sub when present', () => {
    const request = {
      user: { sub: 'a1b2c3-employee-id' },
    } as AuthenticatedRequest;
    const context = new RequestActorContext(request);

    expect(context.actorId).toBe('a1b2c3-employee-id');
  });
});
