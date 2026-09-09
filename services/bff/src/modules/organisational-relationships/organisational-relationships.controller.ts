import {
  Body,
  Controller,
  Headers,
  Param,
  Patch,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { OidcService } from '../auth/oidc.service';
import type { BffSession } from '../auth/session.types';
import { OrganisationalRelationshipsService } from './organisational-relationships.service';

@ApiBearerAuth()
@Controller('organisational-relationships')
export class OrganisationalRelationshipsController {
  constructor(
    private readonly service: OrganisationalRelationshipsService,
    private readonly oidc: OidcService,
  ) {}

  @Patch('people/:personId/manager')
  async changeManager(
    @Param('personId') personId: string,
    @Body() body: unknown,
    @Headers('authorization') incomingAuth: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      await this.service.changeManager(
        personId,
        body,
        await this.resolveAuthorization(incomingAuth, req),
      ),
    );
  }

  @Patch('people/:personId/people-partner')
  async changePeoplePartner(
    @Param('personId') personId: string,
    @Body() body: unknown,
    @Headers('authorization') incomingAuth: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      await this.service.changePeoplePartner(
        personId,
        body,
        await this.resolveAuthorization(incomingAuth, req),
      ),
    );
  }

  @Patch('people/:personId/department')
  async changeDepartment(
    @Param('personId') personId: string,
    @Body() body: unknown,
    @Headers('authorization') incomingAuth: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      await this.service.changeDepartment(
        personId,
        body,
        await this.resolveAuthorization(incomingAuth, req),
      ),
    );
  }

  @Patch('departments/:departmentId/manager')
  async changeDepartmentManager(
    @Param('departmentId') departmentId: string,
    @Body() body: unknown,
    @Headers('authorization') incomingAuth: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      await this.service.changeDepartmentManager(
        departmentId,
        body,
        await this.resolveAuthorization(incomingAuth, req),
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

  /**
   * Returns the Authorization header value to forward to the domain service.
   *
   * Precedence:
   *   1. Explicit incoming bearer token (service-to-service callers passing `Authorization:
   *      Bearer <token>` directly) -- preserved unchanged.
   *   2. Session-derived access token (browser callers authenticated via the OIDC flow) --
   *      wrapped as `Bearer <token>` and injected here so downstream services receive the same
   *      bearer-token format regardless of how the BFF caller authenticated.
   */
  private resolveAuthorization(
    incomingAuth: string | undefined,
    req: Request,
  ): Promise<string | undefined> {
    const session = req.session as BffSession | undefined;
    return this.oidc.resolveAuthorization(
      session,
      incomingAuth,
      'people-service',
    );
  }
}
