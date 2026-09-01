import { Module } from '@nestjs/common';
import { OrganisationalRelationshipsController } from './organisational-relationships.controller';
import { OrganisationalRelationshipsService } from './organisational-relationships.service';

@Module({
  controllers: [OrganisationalRelationshipsController],
  providers: [OrganisationalRelationshipsService],
})
export class OrganisationalRelationshipsModule {}
