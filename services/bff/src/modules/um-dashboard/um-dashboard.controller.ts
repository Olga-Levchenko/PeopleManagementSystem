import { Controller, Get, Headers, Req, Res } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { BffSession } from '../auth/session.types';
import { OidcService } from '../auth/oidc.service';
import { UMDashboardService } from './um-dashboard.service';

@ApiBearerAuth()
@Controller('um-dashboard')
export class UMDashboardController {
  constructor(
    private readonly service: UMDashboardService,
    private readonly oidc: OidcService,
  ) {}

  @Get()
  async getUMDashboard(
    @Headers('authorization') incomingAuth: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = req.session as BffSession;

    // Audience-exchanged token for people-service calls.
    // people-service handles the view-dashboard permission check internally.
    const peopleAuthorization = await this.oidc.resolveAuthorization(
      session,
      incomingAuth,
      'people-service',
    );

    const wmsAuthorization = await this.oidc.resolveAuthorization(
      session,
      incomingAuth,
      'work-management-service',
    );

    const upstream = await this.service.getUMDashboard(
      peopleAuthorization,
      wmsAuthorization,
    );

    res.status(upstream.status);
    return upstream.body;
  }

}
