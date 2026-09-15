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
import { OidcService } from '../auth/oidc.service';
import { ManagementNotesService } from './management-notes.service';

@ApiBearerAuth()
@Controller('management-notes')
export class ManagementNotesController {
  constructor(
    private readonly service: ManagementNotesService,
    private readonly oidc: OidcService,
  ) {}

  @Get()
  async listNotes(
    @Query('subjectPersonId') subjectPersonId: string,
    @Headers('authorization') incomingAuth: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = req.session as BffSession;
    const auth = await this.oidc.resolveAuthorization(session, incomingAuth, 'work-management-service');
    return this.forward(response, await this.service.listNotes(subjectPersonId, auth));
  }

  @Post()
  async createNote(
    @Body() body: unknown,
    @Headers('authorization') incomingAuth: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = req.session as BffSession;
    const auth = await this.oidc.resolveAuthorization(session, incomingAuth, 'work-management-service');
    return this.forward(response, await this.service.createNote(body, auth));
  }

  @Patch(':id')
  async updateNote(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('authorization') incomingAuth: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = req.session as BffSession;
    const auth = await this.oidc.resolveAuthorization(session, incomingAuth, 'work-management-service');
    return this.forward(response, await this.service.updateNote(id, body, auth));
  }

  private forward(
    response: Response,
    upstream: { status: number; body: unknown },
  ) {
    response.status(upstream.status);
    return upstream.body;
  }
}
