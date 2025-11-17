import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { CompanyDashboardService } from './company-dashboard.service';
import { CompanyDashboardController } from './company-dashboard.controller';
import { FirebaseModule } from '../firebase/firebase.module';

@Module({
  imports: [FirebaseModule],
  controllers: [DashboardController, CompanyDashboardController],
  providers: [DashboardService, CompanyDashboardService],
})
export class DashboardModule {}
