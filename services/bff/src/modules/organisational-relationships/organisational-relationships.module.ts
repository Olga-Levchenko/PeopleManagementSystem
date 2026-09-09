import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrganisationalRelationshipsController } from './organisational-relationships.controller';
import { OrganisationalRelationshipsService } from './organisational-relationships.service';

@Module({
  imports: [AuthModule],
  controllers: [OrganisationalRelationshipsController],
  providers: [OrganisationalRelationshipsService],
})
export class OrganisationalRelationshipsModule {}
