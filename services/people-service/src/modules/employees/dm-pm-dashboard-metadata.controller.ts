import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { RequestActorContext } from '../organisational-relationships/request-actor.context';
import { EmployeesService } from './employees.service';

@ApiBearerAuth()
@Controller('internal/dm-pm-dashboard')
export class DMPMDashboardMetadataController {
  constructor(
    private readonly service: EmployeesService,
    private readonly actorContext: RequestActorContext,
  ) {}

  @Get('metadata')
  async getDMPMDashboardMetadata() {
    const callerPersonId = await this.actorContext.resolveActorId();
    return this.service.getDMPMDashboardMetadata(callerPersonId);
  }
}
