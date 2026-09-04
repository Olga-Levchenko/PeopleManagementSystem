import { Module } from '@nestjs/common';
import { IdentityFingerprintService } from './identity-fingerprint.service';
import { IdentityMappingService } from './identity-mapping.service';
import { IdentityValidationService } from './identity-validation.service';
import { UnavailableIdentityLinkProvisioningAuthorizer } from './identity-provisioning.ports';

@Module({
  providers: [
    IdentityMappingService,
    IdentityValidationService,
    IdentityFingerprintService,
    UnavailableIdentityLinkProvisioningAuthorizer,
    {
      provide: 'IIdentityFingerprintService',
      useExisting: IdentityFingerprintService,
    },
    {
      provide: 'IIdentityLinkProvisioningAuthorizer',
      useExisting: UnavailableIdentityLinkProvisioningAuthorizer,
    },
  ],
  exports: [IdentityMappingService],
})
export class IdentityMappingsModule {}
