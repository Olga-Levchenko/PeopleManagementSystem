import { Module } from '@nestjs/common';
import { RequestActorContext } from '../organisational-relationships/request-actor.context';
import { CustomFieldDefinitionsController } from './custom-field-definitions.controller';
import { UnavailableHrAdminPermissionAdapter } from './custom-field-definitions.ports';
import { CustomFieldDefinitionsService } from './custom-field-definitions.service';

@Module({
  controllers: [CustomFieldDefinitionsController],
  providers: [
    CustomFieldDefinitionsService,
    RequestActorContext,
    UnavailableHrAdminPermissionAdapter,
    {
      provide: 'HrAdminPermissionPort',
      useExisting: UnavailableHrAdminPermissionAdapter,
    },
  ],
})
export class CustomFieldDefinitionsModule {}
