import { Controller, Get, Headers, Req, Res } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { BffSession } from '../auth/session.types';
import { OidcService } from '../auth/oidc.service';
import { DMPMDashboardService } from './dm-pm-dashboard.service';

@ApiBearerAuth()
@Controller('dm-pm-dashboard')
export class DMPMDashboardController {
  constructor(
    private readonly service: DMPMDashboardService,
    private readonly oidc: OidcService,
  ) {}

  @Get()
  async getDMPMDashboard(
    @Headers('authorization') incomingAuth: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = req.session as BffSession;

    // Audience-exchanged token for people-service and access-control-service calls
    const peopleAuthorization = await this.oidc.resolveAuthorization(
      session,
      incomingAuth,
      'people-service',
    );
    const acsAuthorization = await this.oidc.resolveAuthorization(
      session,
      incomingAuth,
      'access-control-service',
    );

    // WMS uses the session bearer token directly (no dedicated WMS audience scope),
    // matching the ManagementNotesController forwarding pattern.
    const wmsAuthorization = this.resolveWmsAuthorization(incomingAuth, req);

    const upstream = await this.service.getDMPMDashboard(
      acsAuthorization,
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
   * is forwarded unchanged — the same pattern used by ManagementNotesController and
   * UMDashboardController.
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
