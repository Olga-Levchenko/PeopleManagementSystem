import { Body, Controller, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ChangeDepartmentDto } from './dto/change-department.dto';
import { ChangePersonRelationshipDto } from './dto/change-person-relationship.dto';
import { OrganisationalRelationshipsService } from './organisational-relationships.service';
import { RequestActorContext } from './request-actor.context';

@Controller('organisational-relationships')
export class OrganisationalRelationshipsController {
  constructor(
    private readonly service: OrganisationalRelationshipsService,
    private readonly actor: RequestActorContext,
  ) {}

  @Patch('people/:personId/manager')
  changeManager(
    @Param('personId', new ParseUUIDPipe()) personId: string,
    @Body() body: ChangePersonRelationshipDto,
  ) {
    return this.service.changeManager(
      this.actor.actorId,
      personId,
      body.relatedPersonId,
    );
  }

  @Patch('people/:personId/people-partner')
  changePeoplePartner(
    @Param('personId', new ParseUUIDPipe()) personId: string,
    @Body() body: ChangePersonRelationshipDto,
  ) {
    return this.service.changePeoplePartner(
      this.actor.actorId,
      personId,
      body.relatedPersonId,
    );
  }

  @Patch('people/:personId/department')
  changeDepartment(
    @Param('personId', new ParseUUIDPipe()) personId: string,
    @Body() body: ChangeDepartmentDto,
  ) {
    return this.service.changeDepartment(
      this.actor.actorId,
      personId,
      body.departmentId,
    );
  }

  @Patch('departments/:departmentId/manager')
  changeDepartmentManager(
    @Param('departmentId', new ParseUUIDPipe()) departmentId: string,
    @Body() body: ChangePersonRelationshipDto,
  ) {
    return this.service.changeDepartmentManager(
      this.actor.actorId,
      departmentId,
      body.relatedPersonId,
    );
  }
}
