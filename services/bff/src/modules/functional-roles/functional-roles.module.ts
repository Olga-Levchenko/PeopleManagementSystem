import { Module } from '@nestjs/common';
import { FunctionalRolesController } from './functional-roles.controller';
import { FunctionalRolesService } from './functional-roles.service';

@Module({
  controllers: [FunctionalRolesController],
  providers: [FunctionalRolesService],
})
export class FunctionalRolesModule {}
