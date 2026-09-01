import {
  Inject,
  Injectable,
  Scope,
  UnauthorizedException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user?: {
    sub?: string;
  };
}

@Injectable({ scope: Scope.REQUEST })
export class RequestActorContext {
  constructor(
    @Inject(REQUEST) private readonly request: AuthenticatedRequest,
  ) {}

  get actorId(): string {
    const actorId = this.request.user?.sub;
    if (!actorId) {
      throw new UnauthorizedException('Authenticated actor is required');
    }
    return actorId;
  }
}
