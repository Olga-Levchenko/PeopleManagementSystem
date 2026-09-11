import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProfileModule } from '../profile/profile.module';
import { RequestActorContext } from '../organisational-relationships/request-actor.context';
import { ColleagueBrowseGateService } from './colleague-browse.gate.service';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { SavedViewsController } from './saved-views.controller';
import { SavedViewsService } from './saved-views.service';

@Module({
  imports: [AuthModule, forwardRef(() => ProfileModule)],
  controllers: [EmployeesController, SavedViewsController],
  providers: [
    EmployeesService,
    SavedViewsService,
    ColleagueBrowseGateService,
    RequestActorContext,
  ],
  exports: [EmployeesService, ColleagueBrowseGateService],
})
export class EmployeesModule {}
