import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DMPMDashboardController } from './dm-pm-dashboard.controller';
import { DMPMDashboardService } from './dm-pm-dashboard.service';

@Module({
  imports: [AuthModule],
  controllers: [DMPMDashboardController],
  providers: [DMPMDashboardService],
})
export class DMPMDashboardModule {}
