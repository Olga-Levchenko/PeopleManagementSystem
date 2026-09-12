import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { RequestActorContext } from '../identity/request-actor.context';
import { ActionItemsService } from './action-items.service';
import { CancelActionItemDto } from './dto/cancel-action-item.dto';
import { CompleteActionItemBodyDto } from './dto/complete-action-item.dto';
import { CreateActionItemDto } from './dto/create-action-item.dto';

@ApiBearerAuth()
@Controller('action-items')
export class ActionItemsController {
  constructor(
    private readonly service: ActionItemsService,
    private readonly actor: RequestActorContext,
  ) {}

  @Get('mine')
  async listMyActionItems() {
    const viewerPersonId = await this.actor.resolveActorId();
    return this.service.listMyActionItems(viewerPersonId);
  }

  @Post()
  async createActionItem(@Body() dto: CreateActionItemDto) {
    const viewerPersonId = await this.actor.resolveActorId();
    return this.service.createActionItem(
      viewerPersonId,
      dto,
      this.actor.accessToken,
    );
  }

  @Patch(':id/complete')
  async completeActionItem(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CompleteActionItemBodyDto,
  ) {
    void body;
    const viewerPersonId = await this.actor.resolveActorId();
    return this.service.completeActionItem(viewerPersonId, id);
  }

  @Patch(':id/cancel')
  async cancelActionItem(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelActionItemDto,
  ) {
    const viewerPersonId = await this.actor.resolveActorId();
    return this.service.cancelActionItem(viewerPersonId, id, dto);
  }
}
