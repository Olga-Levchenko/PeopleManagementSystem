import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthCheck,
  HealthCheckService,
  HttpHealthIndicator,
} from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly http: HttpHealthIndicator,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    const baseUrl = this.config.getOrThrow<string>('KEYCLOAK_BASE_URL');
    const realm = this.config.getOrThrow<string>('KEYCLOAK_REALM');
    // Pinging the realm's own discovery document proves both "Keycloak is up" and "our
    // realm actually exists" in one check, not just a bare TCP/HTTP ping at the server root.
    const discoveryUrl = `${baseUrl}/realms/${realm}/.well-known/openid-configuration`;

    return this.health.check([
      () => this.http.pingCheck('keycloak', discoveryUrl),
    ]);
  }
}
