import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Res,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth } from '@nestjs/swagger';
import { RequestActorContext } from '../organisational-relationships/request-actor.context';
import { ColleagueBrowseGateService } from './colleague-browse.gate.service';
import {
  CreateSavedViewDto,
  ShareSavedViewDto,
  UpdateSavedViewDto,
} from './saved-views.dto';
import { SavedViewsService } from './saved-views.service';

@ApiBearerAuth()
@Controller('employees/saved-views')
export class SavedViewsController {
  constructor(
    private readonly service: SavedViewsService,
    private readonly actor: RequestActorContext,
    private readonly colleagueBrowseGate: ColleagueBrowseGateService,
  ) {}

  @Get()
  async listSavedViews() {
    const actorId = await this.actor.resolveActorId();
    await this.colleagueBrowseGate.assertManagementBrowseAllowed(actorId);
    return this.service.listSavedViews(actorId);
  }

  @Post()
  async createSavedView(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    body: CreateSavedViewDto,
  ) {
    const actorId = await this.actor.resolveActorId();
    await this.colleagueBrowseGate.assertManagementBrowseAllowed(actorId);
    return this.service.createSavedView(actorId, body);
  }

  @Patch(':viewId')
  async updateSavedView(
    @Param('viewId') viewId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    body: UpdateSavedViewDto,
  ) {
    const actorId = await this.actor.resolveActorId();
    await this.colleagueBrowseGate.assertManagementBrowseAllowed(actorId);
    return this.service.updateSavedView(actorId, viewId, body);
  }

  @Delete(':viewId')
  @HttpCode(204)
  async deleteSavedView(@Param('viewId') viewId: string) {
    const actorId = await this.actor.resolveActorId();
    await this.colleagueBrowseGate.assertManagementBrowseAllowed(actorId);
    await this.service.deleteSavedView(actorId, viewId);
  }

  @Post(':viewId/shares')
  async shareSavedView(
    @Param('viewId') viewId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    body: ShareSavedViewDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const actorId = await this.actor.resolveActorId();
    await this.colleagueBrowseGate.assertManagementBrowseAllowed(actorId);
    const result = await this.service.shareSavedView(
      actorId,
      viewId,
      body.recipientPersonId,
    );
    response.status(result.statusCode);
    return result.body;
  }

  @Delete(':viewId/shares/:recipientPersonId')
  @HttpCode(204)
  async revokeShare(
    @Param('viewId') viewId: string,
    @Param('recipientPersonId') recipientPersonId: string,
  ) {
    const actorId = await this.actor.resolveActorId();
    await this.colleagueBrowseGate.assertManagementBrowseAllowed(actorId);
    await this.service.revokeShare(actorId, viewId, recipientPersonId);
  }
}
