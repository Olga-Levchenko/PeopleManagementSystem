import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../auth/public.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Public()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([]);
  }
}
