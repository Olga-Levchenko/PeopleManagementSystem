import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { OidcService } from '../auth/oidc.service';
import type { BffSession } from '../auth/session.types';
import { EmployeesService } from './employees.service';

@ApiBearerAuth()
@Controller('people')
export class PeopleController {
  constructor(
    private readonly service: EmployeesService,
    private readonly oidc: OidcService,
  ) {}

  @Get(':subjectPersonId/profile')
  async getProfile(
    @Param('subjectPersonId') subjectPersonId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.getProfile(subjectPersonId, await this.context(request)),
    );
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

  private async forward(
    response: Response,
    upstream: Promise<{ status: number; body: unknown }>,
  ): Promise<unknown> {
    const result = await upstream;
    response.status(result.status);
    return result.body;
  }
}
