import { Module } from '@nestjs/common';
import { CustomFieldDefinitionsController } from './custom-field-definitions.controller';
import { CustomFieldDefinitionsService } from './custom-field-definitions.service';

@Module({
  controllers: [CustomFieldDefinitionsController],
  providers: [CustomFieldDefinitionsService],
})
export class CustomFieldDefinitionsModule {}
