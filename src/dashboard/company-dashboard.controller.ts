import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CompanyDashboardService } from './company-dashboard.service';

@Controller('company-dashboard')
@UseGuards(FirebaseAuthGuard)
export class CompanyDashboardController {
  constructor(private readonly dashboardService: CompanyDashboardService) {}

  @Get('stats')
  async getStats(@Req() req: any) {
    // Get company ID from authenticated user
    const companyEmail = req.user.email;
    const companyId = companyEmail.replace(/[@.]/g, '_');
    
    return this.dashboardService.getCompanyStats(companyId);
  }
}
