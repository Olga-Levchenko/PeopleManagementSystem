import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Scope,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { IdentityResolutionService } from '../identity-mappings/identity-resolution.service';

interface AuthenticatedRequest extends Request {
  user?: {
    sub?: string;
    iss?: string;
  };
}

@Injectable({ scope: Scope.REQUEST })
export class RequestActorContext {
  private resolvedActorIdPromise?: Promise<string>;

  constructor(
    @Inject(REQUEST) private readonly request: AuthenticatedRequest,
    private readonly identityResolution: IdentityResolutionService,
  ) {}

  /**
   * Resolves the authenticated Keycloak principal to the platform `Person.id`.
   * Memoized per request so repeated controller/service calls share one lookup.
   */
  async resolveActorId(): Promise<string> {
    if (!this.resolvedActorIdPromise) {
      this.resolvedActorIdPromise = this.resolveActorIdInternal();
    }
    return this.resolvedActorIdPromise;
  }

  get accessToken(): string {
    const authorization = this.request.headers.authorization;
    if (
      !authorization ||
      !authorization.startsWith('Bearer ') ||
      authorization.length <= 'Bearer '.length
    ) {
      throw new UnauthorizedException('Authenticated access token is required');
    }
    return authorization.slice('Bearer '.length).trim();
  }

  private async resolveActorIdInternal(): Promise<string> {
    const sub = this.request.user?.sub?.trim();
    const iss = this.request.user?.iss?.trim();
    if (!sub || !iss) {
      throw new UnauthorizedException('Authenticated actor is required');
    }

    const result = await this.identityResolution.resolve(iss, sub);
    switch (result.outcome) {
      case 'resolved':
        return result.personId;
      case 'missing':
        throw new NotFoundException(
          'The authenticated principal has no active person mapping.',
        );
      case 'ambiguous':
        throw new ConflictException(
          'The authenticated principal has an ambiguous person mapping.',
        );
      case 'unavailable':
        throw new ServiceUnavailableException(
          'Identity resolution is unavailable.',
        );
      default:
        throw new UnauthorizedException('Authenticated actor is required');
    }
  }
}
