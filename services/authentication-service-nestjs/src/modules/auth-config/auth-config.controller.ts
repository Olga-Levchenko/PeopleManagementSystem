import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthConfigService } from './auth-config.service';
import { SwaggerGetAuthConfig } from './auth-config.swagger';
import { AuthConfigEntity } from './entities/auth-config.entity';

@ApiTags('auth')
@Controller('auth')
export class AuthConfigController {
  constructor(private readonly authConfigService: AuthConfigService) {}

  @Get('config')
  @SwaggerGetAuthConfig()
  getConfig(): AuthConfigEntity {
    return this.authConfigService.getConfig();
  }
}
