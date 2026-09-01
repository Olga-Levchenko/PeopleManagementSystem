import { Module } from '@nestjs/common'
import { OrganisationalRelationshipsController } from './organisational-relationships.controller'
import { OrganisationalRelationshipsService } from './organisational-relationships.service'
import { RequestActorContext } from './request-actor.context'
import {
  UnavailableProjectionUpdateAdapter,
  UnavailableRelationshipPermissionAdapter,
} from './organisational-relationships.ports'

@Module({
  controllers: [OrganisationalRelationshipsController],
  providers: [
    OrganisationalRelationshipsService,
    RequestActorContext,
    UnavailableRelationshipPermissionAdapter,
    UnavailableProjectionUpdateAdapter,
    {
      provide: 'RelationshipPermissionPort',
      useExisting: UnavailableRelationshipPermissionAdapter,
    },
    {
      provide: 'ProjectionUpdatePort',
      useExisting: UnavailableProjectionUpdateAdapter,
    },
  ],
  exports: [OrganisationalRelationshipsService],
})
export class OrganisationalRelationshipsModule {}
