import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ProfileService } from './profile.service';
import { RequestActorContext } from '../organisational-relationships/request-actor.context';

@ApiBearerAuth()
@Controller('people')
export class ProfileController {
  constructor(
    private readonly service: ProfileService,
    private readonly actor: RequestActorContext,
  ) {}

  @Get(':subjectPersonId/profile')
  getProfile(
    @Param('subjectPersonId', new ParseUUIDPipe()) subjectPersonId: string,
  ) {
    return this.service.getProfile(this.actor.actorId, subjectPersonId);
  }
}
