import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IdentityModule } from '../identity/identity.module';
import { HttpAccessRoleResolutionAdapter } from '../management-notes/access-control-client';
import { RisksController } from './risks.controller';
import { RisksService } from './risks.service';
import { HttpRisksPermissionsCheckAdapter } from './permissions-client';

@Module({
  imports: [AuthModule, IdentityModule],
  controllers: [RisksController],
  providers: [
    RisksService,
    HttpRisksPermissionsCheckAdapter,
    {
      provide: 'RisksPermissionsCheckPort',
      useExisting: HttpRisksPermissionsCheckAdapter,
    },
    HttpAccessRoleResolutionAdapter,
    {
      provide: 'AccessRoleResolutionPort',
      useExisting: HttpAccessRoleResolutionAdapter,
    },
  ],
})
export class RisksModule {}
