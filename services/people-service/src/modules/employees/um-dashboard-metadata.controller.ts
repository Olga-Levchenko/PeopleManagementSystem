import { Controller, ForbiddenException, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ServiceTokenExchangeService } from '../auth/service-token-exchange.service';
import { RequestActorContext } from '../organisational-relationships/request-actor.context';
import { EmployeesService } from './employees.service';

@ApiBearerAuth()
@Controller('internal/um-dashboard')
export class UMDashboardMetadataController {
  constructor(
    private readonly service: EmployeesService,
    private readonly actorContext: RequestActorContext,
    private readonly tokenExchange: ServiceTokenExchangeService,
    private readonly config: ConfigService,
  ) {}

  @Get('metadata')
  async getUMDashboardMetadata() {
    const [callerPersonId, granted] = await Promise.all([
      this.actorContext.resolveActorId(),
      this.checkViewDashboardPermission('unit-manager'),
    ]);
    if (!granted) throw new ForbiddenException();
    return this.service.getUMDashboardMetadata(callerPersonId);
  }

  private async checkViewDashboardPermission(dashboardType: string): Promise<boolean> {
    try {
      const acsToken = await this.tokenExchange.exchangeForAudience(
        this.actorContext.accessToken,
        'access-control-service',
      );
      const baseUrl = this.config.getOrThrow<string>('ACCESS_CONTROL_SERVICE_BASE_URL');
      const response = await fetch(`${baseUrl}/api/v1/permissions/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${acsToken}` },
        body: JSON.stringify({ permissionKey: 'view-dashboard', scope: { dashboardType } }),
      });
      if (!response.ok) return false;
      const body = (await response.json()) as { granted?: boolean };
      return body.granted === true;
    } catch {
      return false;
    }
  }
}
