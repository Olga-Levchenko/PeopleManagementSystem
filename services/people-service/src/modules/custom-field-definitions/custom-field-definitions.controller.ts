import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { RequestActorContext } from '../organisational-relationships/request-actor.context';
import {
  CreateCustomFieldDefinitionDto,
  UpdateCustomFieldDefinitionDto,
} from './custom-field-definitions.dto';
import {
  assertDataTypeNotPresent,
  CustomFieldDefinitionsService,
} from './custom-field-definitions.service';

@ApiBearerAuth()
@Controller('custom-field-definitions')
export class CustomFieldDefinitionsController {
  constructor(
    private readonly service: CustomFieldDefinitionsService,
    private readonly actor: RequestActorContext,
  ) {}

  /** GET /api/v1/custom-field-definitions — any authenticated user. */
  @Get()
  listAll() {
    return this.service.listAll();
  }

  /** POST /api/v1/custom-field-definitions — HR Admin only. */
  @Post()
  create(@Body() dto: CreateCustomFieldDefinitionDto) {
    return this.service.create(this.actor.actorId, dto);
  }

  /**
   * PATCH /api/v1/custom-field-definitions/:id — HR Admin only.
   * Accepts `name` and `visibility` only; rejects any payload that includes `dataType`
   * before the DTO even reaches the service.
   */
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCustomFieldDefinitionDto,
    @Body() rawBody: Record<string, unknown>,
  ) {
    assertDataTypeNotPresent(rawBody);
    return this.service.update(this.actor.actorId, id, dto);
  }

  /** DELETE /api/v1/custom-field-definitions/:id — HR Admin only; soft-delete (sets isActive=false). */
  @Delete(':id')
  deactivate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.deactivate(this.actor.actorId, id);
  }
}
