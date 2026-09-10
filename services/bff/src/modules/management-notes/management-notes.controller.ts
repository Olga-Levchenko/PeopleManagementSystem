import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { BffSession } from '../auth/session.types';
import { ManagementNotesService } from './management-notes.service';

@ApiBearerAuth()
@Controller('management-notes')
export class ManagementNotesController {
  constructor(private readonly service: ManagementNotesService) {}

  @Get()
  async listNotes(
    @Query('subjectPersonId') subjectPersonId: string,
    @Headers('authorization') incomingAuth: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      await this.service.listNotes(
        subjectPersonId,
        this.resolveAuthorization(incomingAuth, req),
      ),
    );
  }

  @Post()
  async createNote(
    @Body() body: unknown,
    @Headers('authorization') incomingAuth: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      await this.service.createNote(
        body,
        this.resolveAuthorization(incomingAuth, req),
      ),
    );
  }

  @Patch(':id')
  async updateNote(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('authorization') incomingAuth: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      await this.service.updateNote(
        id,
        body,
        this.resolveAuthorization(incomingAuth, req),
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
   * Returns the Authorization header value to forward to work-management-service.
   *
   * Unlike `OrganisationalRelationshipsController`/`FunctionalRolesController`, this does NOT go
   * through `OidcService.resolveAuthorization`'s audience-specific token exchange --
   * work-management-service's own `JwtStrategy` still validates the plain `bff-confidential`
   * audience (it has no dedicated `work-management-service-audience` client scope the way
   * people-service/access-control-service now do), so the same bearer token this BFF itself
   * validated is forwarded unchanged, exactly as `OrganisationalRelationshipsController` used to
   * work before that migration.
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
