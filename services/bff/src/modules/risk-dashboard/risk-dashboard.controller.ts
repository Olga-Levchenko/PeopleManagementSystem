import { Controller, Get, Headers, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { BffSession } from '../auth/session.types';
import { OidcService } from '../auth/oidc.service';
import { RiskDashboardService } from './risk-dashboard.service';

@Controller('risk-dashboard')
export class RiskDashboardController {
  constructor(
    private readonly service: RiskDashboardService,
    private readonly oidc: OidcService,
  ) {}

  @Get()
  async getDashboard(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') incomingAuth: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = req.session as BffSession;
    const authorization = await this.oidc.resolveAuthorization(
      session,
      incomingAuth,
      'work-management-service',
    );
    const peopleAuthorization = await this.oidc.resolveAuthorization(
      session,
      incomingAuth,
      'people-service',
    );
    const upstream = await this.service.getDashboard(
      query,
      authorization,
      peopleAuthorization,
    );
    res.status(upstream.status);
    return upstream.body;
  }
}
