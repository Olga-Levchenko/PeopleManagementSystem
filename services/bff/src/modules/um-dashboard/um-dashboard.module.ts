import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UMDashboardController } from './um-dashboard.controller';
import { UMDashboardService } from './um-dashboard.service';

@Module({
  imports: [AuthModule],
  controllers: [UMDashboardController],
  providers: [UMDashboardService],
})
export class UMDashboardModule {}
