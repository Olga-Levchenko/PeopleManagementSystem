import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PPDashboardController } from './pp-dashboard.controller';
import { PPDashboardService } from './pp-dashboard.service';

@Module({
  imports: [AuthModule],
  controllers: [PPDashboardController],
  providers: [PPDashboardService],
})
export class PPDashboardModule {}
