import { Module } from '@nestjs/common';
import { IdentityFingerprintService } from './identity-fingerprint.service';
import { IdentityMappingService } from './identity-mapping.service';
import { IdentityResolutionController } from './identity-resolution.controller';
import { IdentityResolutionService } from './identity-resolution.service';
import { IdentityValidationService } from './identity-validation.service';
import {
  InternalServiceAuthGuard,
  UnavailableInternalServiceAuthorizer,
} from './internal-service-auth.guard';
import { UnavailableIdentityLinkProvisioningAuthorizer } from './identity-provisioning.ports';

@Module({
  controllers: [IdentityResolutionController],
  providers: [
    IdentityMappingService,
    IdentityResolutionService,
    IdentityValidationService,
    IdentityFingerprintService,
    UnavailableIdentityLinkProvisioningAuthorizer,
    InternalServiceAuthGuard,
    UnavailableInternalServiceAuthorizer,
    {
      provide: 'IIdentityFingerprintService',
      useExisting: IdentityFingerprintService,
    },
    {
      provide: 'IIdentityLinkProvisioningAuthorizer',
      useExisting: UnavailableIdentityLinkProvisioningAuthorizer,
    },
    {
      provide: 'IInternalServiceAuthorizer',
      useExisting: UnavailableInternalServiceAuthorizer,
    },
  ],
  exports: [IdentityMappingService, IdentityResolutionService],
})
export class IdentityMappingsModule {}
