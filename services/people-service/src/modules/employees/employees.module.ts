import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IdentityMappingsModule } from '../identity-mappings/identity-mappings.module';
import { ProfileModule } from '../profile/profile.module';
import { RequestActorContext } from '../organisational-relationships/request-actor.context';
import { ColleagueBrowseGateService } from './colleague-browse.gate.service';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { DMPMDashboardMetadataController } from './dm-pm-dashboard-metadata.controller';
import { RiskDashboardMetadataController } from './risk-dashboard-metadata.controller';
import { UMDashboardMetadataController } from './um-dashboard-metadata.controller';
import { PPDashboardMetadataController } from './pp-dashboard-metadata.controller';
import { SavedViewsController } from './saved-views.controller';
import { SavedViewsService } from './saved-views.service';

@Module({
  imports: [
    AuthModule,
    IdentityMappingsModule,
    forwardRef(() => ProfileModule),
  ],
  controllers: [
    EmployeesController,
    DMPMDashboardMetadataController,
    RiskDashboardMetadataController,
    UMDashboardMetadataController,
    PPDashboardMetadataController,
    SavedViewsController,
  ],
  providers: [
    EmployeesService,
    SavedViewsService,
    ColleagueBrowseGateService,
    RequestActorContext,
  ],
  exports: [EmployeesService, ColleagueBrowseGateService],
})
export class EmployeesModule {}
