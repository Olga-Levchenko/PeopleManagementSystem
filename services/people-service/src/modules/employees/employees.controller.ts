import { Controller, Get, Query, Req, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { RequestActorContext } from '../organisational-relationships/request-actor.context';
import { ListEmployeesQueryDto } from './employees.dto';
import { parseCustomFieldFilters } from './employees-query.util';
import { EmployeesService } from './employees.service';

@ApiBearerAuth()
@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly service: EmployeesService,
    private readonly actor: RequestActorContext,
  ) {}

  @Get('field-catalog')
  getFieldCatalog() {
    return this.service.getFieldCatalog(this.actor.actorId);
  }

  @Get()
  listEmployees(
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
    return this.service.listEmployees(
      this.actor.actorId,
      query,
      parseCustomFieldFilters(request.query),
    );
  }
}
