import { Injectable, UnauthorizedException } from '@nestjs/common';

export interface IdentityLinkProvisioningActor {
  readonly actorType: string;
  readonly actorIdentifier: string;
}

export interface IIdentityLinkProvisioningAuthorizer {
  authorize(): Promise<IdentityLinkProvisioningActor | null>;
}

@Injectable()
export class UnavailableIdentityLinkProvisioningAuthorizer implements IIdentityLinkProvisioningAuthorizer {
  authorize(): Promise<IdentityLinkProvisioningActor | null> {
    return Promise.reject(
      new UnauthorizedException(
        'Identity-link provisioning authorization is unavailable',
      ),
    );
  }
}
