import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { RequestActorContext } from '../organisational-relationships/request-actor.context';
import {
  ListEmployeesQueryDto,
  ExportEmployeesQueryDto,
} from './employees.dto';
import {
  parseCustomFieldFilters,
  parseExportColumnKeys,
} from './employees-query.util';
import { EmployeesService } from './employees.service';
import { ColleagueBrowseGateService } from './colleague-browse.gate.service';

@ApiBearerAuth()
@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly service: EmployeesService,
    private readonly actor: RequestActorContext,
    private readonly colleagueBrowseGate: ColleagueBrowseGateService,
  ) {}

  @Get('field-catalog')
  async getFieldCatalog() {
    const actorId = await this.actor.resolveActorId();
    return this.service.getFieldCatalog(actorId);
  }

  @Get('export')
  async exportEmployees(
    @Query(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
      }),
    )
    query: ExportEmployeesQueryDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const actorId = await this.actor.resolveActorId();
    await this.colleagueBrowseGate.assertManagementBrowseAllowed(actorId);
    const columnKeys = parseExportColumnKeys(query.columns);
    const { buffer, filename } = await this.service.exportEmployeesToXlsx(
      actorId,
      query,
      parseCustomFieldFilters(request.query),
      columnKeys,
    );

    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    response.send(buffer);
  }

  @Get()
  async listEmployees(
    @Query(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
      }),
    )
    query: ListEmployeesQueryDto,
    @Req() request: Request,
  ) {
    const actorId = await this.actor.resolveActorId();
    return this.service.listEmployees(
      actorId,
      query,
      parseCustomFieldFilters(request.query),
    );
  }
}
