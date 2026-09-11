import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ProfileService } from './profile.service';
import { PatchProfileFieldDto } from './profile.dto';
import { RequestActorContext } from '../organisational-relationships/request-actor.context';
import { ColleagueBrowseGateService } from '../employees/colleague-browse.gate.service';

@ApiBearerAuth()
@Controller('people')
export class ProfileController {
  constructor(
    private readonly service: ProfileService,
    private readonly actor: RequestActorContext,
    private readonly colleagueBrowseGate: ColleagueBrowseGateService,
  ) {}

  @Get(':subjectPersonId/profile')
  async getProfile(
    @Param('subjectPersonId', new ParseUUIDPipe()) subjectPersonId: string,
  ) {
    const actorId = await this.actor.resolveActorId();
    return this.service.getProfile(actorId, subjectPersonId);
  }

  @Patch(':subjectPersonId/profile/fields')
  async patchProfileField(
    @Param('subjectPersonId', new ParseUUIDPipe()) subjectPersonId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
      }),
    )
    dto: PatchProfileFieldDto,
  ) {
    const actorId = await this.actor.resolveActorId();
    if (actorId !== subjectPersonId) {
      await this.colleagueBrowseGate.assertManagementBrowseAllowed(actorId);
    }
    return this.service.patchProfileField(
      actorId,
      subjectPersonId,
      dto.fieldKey,
      dto.value,
    );
  }
}
