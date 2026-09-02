import { Module } from '@nestjs/common';
import { AuthConfigController } from './auth-config.controller';
import { AuthConfigService } from './auth-config.service';

@Module({
  controllers: [AuthConfigController],
  providers: [AuthConfigService],
})
export class AuthConfigModule {}
