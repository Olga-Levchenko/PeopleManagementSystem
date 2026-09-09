import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IdentityFingerprintService } from './identity-fingerprint.service';
import { IdentityMappingService } from './identity-mapping.service';
import {
  BootstrapIdentityResolutionController,
  IdentityResolutionController,
} from './identity-resolution.controller';
import { IdentityResolutionService } from './identity-resolution.service';
import { IdentityValidationService } from './identity-validation.service';
import { UnavailableIdentityLinkProvisioningAuthorizer } from './identity-provisioning.ports';

@Module({
  imports: [AuthModule],
  controllers: [
    IdentityResolutionController,
    BootstrapIdentityResolutionController,
  ],
  providers: [
    IdentityMappingService,
    IdentityResolutionService,
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
  exports: [IdentityMappingService, IdentityResolutionService],
})
export class IdentityMappingsModule {}
