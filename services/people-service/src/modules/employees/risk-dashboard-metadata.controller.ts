import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { RiskDashboardMetadataDto } from './employees.dto';
import { EmployeesService } from './employees.service';

@ApiBearerAuth()
@Controller('internal/risk-dashboard')
export class RiskDashboardMetadataController {
  constructor(private readonly service: EmployeesService) {}

  @Post('metadata')
  async getRiskDashboardMetadata(@Body() body: RiskDashboardMetadataDto) {
    if (new Set(body.personIds).size !== body.personIds.length) {
      return { people: [] };
    }

    return this.service.getRiskDashboardMetadata(body.personIds);
  }
}
