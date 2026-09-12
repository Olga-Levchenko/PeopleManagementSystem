import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { RequestActorContext } from '../identity/request-actor.context';
import { CreateManagementNoteDto } from './dto/create-management-note.dto';
import { UpdateManagementNoteDto } from './dto/update-management-note.dto';
import { ManagementNotesService } from './management-notes.service';

@ApiBearerAuth()
@Controller('management-notes')
export class ManagementNotesController {
  constructor(
    private readonly service: ManagementNotesService,
    private readonly actor: RequestActorContext,
  ) {}

  @Get()
  async listNotes(
    @Query('subjectPersonId', new ParseUUIDPipe()) subjectPersonId: string,
  ) {
    const viewerPersonId = await this.actor.resolveActorId();
    return this.service.listNotes(
      viewerPersonId,
      subjectPersonId,
      this.actor.accessToken,
    );
  }

  @Post()
  async createNote(@Body() dto: CreateManagementNoteDto) {
    const viewerPersonId = await this.actor.resolveActorId();
    return this.service.createNote(viewerPersonId, dto, this.actor.accessToken);
  }

  @Patch(':id')
  async updateNote(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateManagementNoteDto,
  ) {
    const viewerPersonId = await this.actor.resolveActorId();
    return this.service.updateNote(
      viewerPersonId,
      id,
      dto,
      this.actor.accessToken,
    );
  }
}
