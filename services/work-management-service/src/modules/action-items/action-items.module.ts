import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IdentityModule } from '../identity/identity.module';
import { HttpAccessRoleResolutionAdapter } from '../management-notes/access-control-client';
import { ActionItemsController } from './action-items.controller';
import { ActionItemsService } from './action-items.service';
import { HttpPermissionsCheckAdapter } from './permissions-client';

@Module({
  imports: [AuthModule, IdentityModule],
  controllers: [ActionItemsController],
  providers: [
    ActionItemsService,
    HttpPermissionsCheckAdapter,
    {
      provide: 'PermissionsCheckPort',
      useExisting: HttpPermissionsCheckAdapter,
    },
    HttpAccessRoleResolutionAdapter,
    {
      provide: 'AccessRoleResolutionPort',
      useExisting: HttpAccessRoleResolutionAdapter,
    },
  ],
})
export class ActionItemsModule {}
