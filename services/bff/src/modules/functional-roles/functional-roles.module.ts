import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FunctionalRolesController } from './functional-roles.controller';
import { FunctionalRolesService } from './functional-roles.service';

@Module({
  imports: [AuthModule],
  controllers: [FunctionalRolesController],
  providers: [FunctionalRolesService],
})
export class FunctionalRolesModule {}
