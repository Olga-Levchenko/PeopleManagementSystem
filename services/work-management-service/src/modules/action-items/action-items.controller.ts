import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { RequestActorContext } from '../identity/request-actor.context';
import { ActionItemsService } from './action-items.service';
import { CreateActionItemDto } from './dto/create-action-item.dto';

@ApiBearerAuth()
@Controller('action-items')
export class ActionItemsController {
  constructor(
    private readonly service: ActionItemsService,
    private readonly actor: RequestActorContext,
  ) {}

  @Post()
  async createActionItem(@Body() dto: CreateActionItemDto) {
    const viewerPersonId = await this.actor.resolveActorId();
    return this.service.createActionItem(
      viewerPersonId,
      dto,
      this.actor.accessToken,
    );
  }
}
