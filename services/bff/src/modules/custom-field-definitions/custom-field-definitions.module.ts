import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomFieldDefinitionsController } from './custom-field-definitions.controller';
import { CustomFieldDefinitionsService } from './custom-field-definitions.service';

@Module({
  imports: [AuthModule],
  controllers: [CustomFieldDefinitionsController],
  providers: [CustomFieldDefinitionsService],
})
export class CustomFieldDefinitionsModule {}
