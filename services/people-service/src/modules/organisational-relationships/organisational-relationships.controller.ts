import { Body, Controller, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ChangeDepartmentDto } from './dto/change-department.dto';
import { ChangePersonRelationshipDto } from './dto/change-person-relationship.dto';
import { OrganisationalRelationshipsService } from './organisational-relationships.service';
import { RequestActorContext } from './request-actor.context';

@ApiBearerAuth()
@Controller('organisational-relationships')
export class OrganisationalRelationshipsController {
  constructor(
    private readonly service: OrganisationalRelationshipsService,
    private readonly actor: RequestActorContext,
  ) {}

  @Patch('people/:personId/manager')
  async changeManager(
    @Param('personId', new ParseUUIDPipe()) personId: string,
    @Body() body: ChangePersonRelationshipDto,
  ) {
    const actorId = await this.actor.resolveActorId();
    return this.service.changeManager(actorId, personId, body.relatedPersonId);
  }

  @Patch('people/:personId/people-partner')
  async changePeoplePartner(
    @Param('personId', new ParseUUIDPipe()) personId: string,
    @Body() body: ChangePersonRelationshipDto,
  ) {
    const actorId = await this.actor.resolveActorId();
    return this.service.changePeoplePartner(
      actorId,
      personId,
      body.relatedPersonId,
    );
  }

  @Patch('people/:personId/department')
  async changeDepartment(
    @Param('personId', new ParseUUIDPipe()) personId: string,
    @Body() body: ChangeDepartmentDto,
  ) {
    const actorId = await this.actor.resolveActorId();
    return this.service.changeDepartment(actorId, personId, body.departmentId);
  }

  @Patch('departments/:departmentId/manager')
  async changeDepartmentManager(
    @Param('departmentId', new ParseUUIDPipe()) departmentId: string,
    @Body() body: ChangePersonRelationshipDto,
  ) {
    const actorId = await this.actor.resolveActorId();
    return this.service.changeDepartmentManager(
      actorId,
      departmentId,
      body.relatedPersonId,
    );
  }
}
