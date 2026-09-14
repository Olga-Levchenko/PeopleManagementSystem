import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { RequestActorContext } from '../organisational-relationships/request-actor.context';
import { EmployeesService } from './employees.service';

@ApiBearerAuth()
@Controller('internal/um-dashboard')
export class UMDashboardMetadataController {
  constructor(
    private readonly service: EmployeesService,
    private readonly actorContext: RequestActorContext,
  ) {}

  @Get('metadata')
  async getUMDashboardMetadata() {
    const callerPersonId = await this.actorContext.resolveActorId();
    return this.service.getUMDashboardMetadata(callerPersonId);
  }
}
