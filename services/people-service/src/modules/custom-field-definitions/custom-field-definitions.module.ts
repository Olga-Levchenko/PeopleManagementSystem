import { Module } from '@nestjs/common';
import { RequestActorContext } from '../organisational-relationships/request-actor.context';
import { CustomFieldDefinitionsController } from './custom-field-definitions.controller';
import { HttpHrAdminPermissionAdapter } from './custom-field-definitions.ports';
import { CustomFieldDefinitionsService } from './custom-field-definitions.service';

@Module({
  controllers: [CustomFieldDefinitionsController],
  providers: [
    CustomFieldDefinitionsService,
    RequestActorContext,
    HttpHrAdminPermissionAdapter,
    {
      provide: 'HrAdminPermissionPort',
      useExisting: HttpHrAdminPermissionAdapter,
    },
  ],
})
export class CustomFieldDefinitionsModule {}
