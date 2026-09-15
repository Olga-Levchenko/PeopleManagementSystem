import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { OidcService } from '../auth/oidc.service';
import type { BffSession } from '../auth/session.types';
import { DepartmentsService } from './departments.service';

@ApiBearerAuth()
@Controller('departments')
export class DepartmentsController {
  constructor(
    private readonly service: DepartmentsService,
    private readonly oidc: OidcService,
  ) {}

  @Get()
  async search(
    @Query('name') name: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.service.search(name, await this.context(request));
    response.status(result.status);
    return result.body;
  }

  private async context(request: Request) {
    const session = request.session as BffSession | undefined;
    return {
      authorization: await this.oidc.resolveAuthorization(
        session,
        request.headers.authorization,
        'people-service',
      ),
      correlationId: request.correlationId,
    };
  }
}
