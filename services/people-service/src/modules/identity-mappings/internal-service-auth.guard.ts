import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import {
  type IInternalServiceAuthorizer,
  type InternalServiceAuthorizationResult,
} from './identity-resolution.ports';

@Injectable()
export class InternalServiceAuthGuard implements CanActivate {
  constructor(
    @Inject('IInternalServiceAuthorizer')
    private readonly authorizer: IInternalServiceAuthorizer,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const authorizationHeader = req.headers.authorization;
    let result: InternalServiceAuthorizationResult;
    try {
      result = await this.authorizer.authorize(authorizationHeader);
    } catch {
      throw new ServiceUnavailableException(
        'Internal service authorization is unavailable',
      );
    }

    if (result.outcome === 'missing') {
      throw new UnauthorizedException(
        'Authenticated internal service identity is required',
      );
    }
    if (result.outcome === 'unauthorized') {
      throw new ForbiddenException('Internal service is not authorized');
    }

    return true;
  }
}

@Injectable()
export class SecretInternalServiceAuthorizer implements IInternalServiceAuthorizer {
  constructor(private readonly config: ConfigService) {}

  authorize(
    authorizationHeader?: string,
  ): Promise<InternalServiceAuthorizationResult> {
    if (!authorizationHeader) {
      return Promise.resolve({ outcome: 'missing' });
    }
    const secret = this.config.get<string>('INTERNAL_SERVICE_SECRET');
    if (!secret) {
      return Promise.resolve({ outcome: 'missing' });
    }
    if (authorizationHeader === `InternalService ${secret}`) {
      return Promise.resolve({
        outcome: 'authenticated',
        context: {
          serviceName: 'access-control-service',
          authenticationId: 'acs',
        },
      });
    }
    return Promise.resolve({ outcome: 'unauthorized' });
  }
}

@Injectable()
export class UnavailableInternalServiceAuthorizer implements IInternalServiceAuthorizer {
  authorize(): Promise<InternalServiceAuthorizationResult> {
    return Promise.reject(
      new ServiceUnavailableException(
        'Internal service authorization is unavailable',
      ),
    );
  }
}
