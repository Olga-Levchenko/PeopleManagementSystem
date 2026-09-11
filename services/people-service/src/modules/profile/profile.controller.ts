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
  getProfile(
    @Param('subjectPersonId', new ParseUUIDPipe()) subjectPersonId: string,
  ) {
    return this.service.getProfile(this.actor.actorId, subjectPersonId);
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
    await this.colleagueBrowseGate.assertManagementBrowseAllowed(
      this.actor.actorId,
    );
    return this.service.patchProfileField(
      this.actor.actorId,
      subjectPersonId,
      dto.fieldKey,
      dto.value,
    );
  }
}
