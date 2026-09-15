import { Controller, Get, Headers, Req, Res } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { BffSession } from '../auth/session.types';
import { OidcService } from '../auth/oidc.service';
import { PPDashboardService } from './pp-dashboard.service';

@ApiBearerAuth()
@Controller('pp-dashboard')
export class PPDashboardController {
  constructor(
    private readonly service: PPDashboardService,
    private readonly oidc: OidcService,
  ) {}

  @Get()
  async getPPDashboard(
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

    // WMS uses the session bearer token directly (no dedicated WMS audience scope),
    // matching the ManagementNotesController forwarding pattern.
    const wmsAuthorization = this.resolveWmsAuthorization(incomingAuth, req);

    const upstream = await this.service.getPPDashboard(
      peopleAuthorization,
      wmsAuthorization,
    );

    res.status(upstream.status);
    return upstream.body;
  }

  /**
   * Returns the Authorization header value to forward to work-management-service.
   *
   * WMS's JwtStrategy still validates the plain `bff-confidential` audience (no dedicated
   * `work-management-service-audience` client scope exists yet), so the session bearer token
   * is forwarded unchanged — the same pattern used by ManagementNotesController,
   * UMDashboardController, and DMPMDashboardController.
   */
  private resolveWmsAuthorization(
    incomingAuth: string | undefined,
    req: Request,
  ): string | undefined {
    if (incomingAuth) {
      return incomingAuth;
    }
    const session = req.session as BffSession;
    if (session.accessToken) {
      return `Bearer ${session.accessToken}`;
    }
    return undefined;
  }
}
