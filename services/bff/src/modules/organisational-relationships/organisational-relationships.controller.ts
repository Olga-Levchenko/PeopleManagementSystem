import { Body, Controller, Headers, Param, Patch, Res } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { OrganisationalRelationshipsService } from './organisational-relationships.service';

@ApiBearerAuth()
@Controller('organisational-relationships')
export class OrganisationalRelationshipsController {
  constructor(private readonly service: OrganisationalRelationshipsService) {}

  @Patch('people/:personId/manager')
  async changeManager(
    @Param('personId') personId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      await this.service.changeManager(personId, body, authorization),
    );
  }

  @Patch('people/:personId/people-partner')
  async changePeoplePartner(
    @Param('personId') personId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      await this.service.changePeoplePartner(personId, body, authorization),
    );
  }

  @Patch('people/:personId/department')
  async changeDepartment(
    @Param('personId') personId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      await this.service.changeDepartment(personId, body, authorization),
    );
  }

  @Patch('departments/:departmentId/manager')
  async changeDepartmentManager(
    @Param('departmentId') departmentId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      await this.service.changeDepartmentManager(
        departmentId,
        body,
        authorization,
      ),
    );
  }

  private forward(
    response: Response,
    upstream: { status: number; body: unknown },
  ) {
    response.status(upstream.status);
    return upstream.body;
  }
}
