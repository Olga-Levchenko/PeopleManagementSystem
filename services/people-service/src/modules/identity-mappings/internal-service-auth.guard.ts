import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
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

  async canActivate(_context: ExecutionContext): Promise<boolean> {
    void _context;
    let result: InternalServiceAuthorizationResult;
    try {
      result = await this.authorizer.authorize();
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
export class UnavailableInternalServiceAuthorizer implements IInternalServiceAuthorizer {
  authorize(): Promise<InternalServiceAuthorizationResult> {
    return Promise.reject(
      new ServiceUnavailableException(
        'Internal service authorization is unavailable',
      ),
    );
  }
}
