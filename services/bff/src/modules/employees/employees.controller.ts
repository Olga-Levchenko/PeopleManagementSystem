import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { OidcService } from '../auth/oidc.service';
import type { BffSession } from '../auth/session.types';
import { EmployeesService } from './employees.service';

@ApiBearerAuth()
@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly service: EmployeesService,
    private readonly oidc: OidcService,
  ) {}

  @Get('saved-views')
  async listSavedViews(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.listSavedViews(await this.context(request)),
    );
  }

  @Post('saved-views')
  async createSavedView(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.createSavedView(body, await this.context(request)),
    );
  }

  @Patch('saved-views/:viewId')
  async updateSavedView(
    @Param('viewId') viewId: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.updateSavedView(viewId, body, await this.context(request)),
    );
  }

  @Delete('saved-views/:viewId')
  async deleteSavedView(
    @Param('viewId') viewId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.deleteSavedView(viewId, await this.context(request)),
    );
  }

  @Post('saved-views/:viewId/shares')
  async shareSavedView(
    @Param('viewId') viewId: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.shareSavedView(viewId, body, await this.context(request)),
    );
  }

  @Delete('saved-views/:viewId/shares/:recipientPersonId')
  async revokeSavedViewShare(
    @Param('viewId') viewId: string,
    @Param('recipientPersonId') recipientPersonId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.revokeSavedViewShare(
        viewId,
        recipientPersonId,
        await this.context(request),
      ),
    );
  }

  @Get('field-catalog')
  async fieldCatalog(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.fieldCatalog(await this.context(request)),
    );
  }

  @Patch(':subjectPersonId/fields')
  async patchField(
    @Param('subjectPersonId') subjectPersonId: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.patchField(
        subjectPersonId,
        body,
        await this.context(request),
      ),
    );
  }

  @Get()
  async list(
    @Query() query: Record<string, string | undefined>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.forward(
      response,
      this.service.list(query, await this.context(request)),
    );
  }

  @Get('export')
  async exportEmployees(
    @Query() query: Record<string, string | undefined>,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const result = await this.service.exportEmployees(
      query,
      await this.context(request),
    );
    response.status(result.status);
    for (const [header, value] of Object.entries(result.headers)) {
      response.setHeader(header, value);
    }
    response.send(result.body);
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
