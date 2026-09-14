import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RiskDashboardController } from './risk-dashboard.controller';
import { RiskDashboardService } from './risk-dashboard.service';

@Module({
  imports: [AuthModule],
  controllers: [RiskDashboardController],
  providers: [RiskDashboardService],
})
export class RiskDashboardModule {}
