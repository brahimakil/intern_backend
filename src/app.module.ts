import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FirebaseModule } from './firebase/firebase.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { StudentsModule } from './students/students.module';
import { CompaniesModule } from './companies/companies.module';
import { InternshipsModule } from './internships/internships.module';
import { ApplicationsModule } from './applications/applications.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { AdminsModule } from './admins/admins.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { AiModule } from './ai/ai.module';
import { CompanyAuthController } from './auth/company-auth.controller';

@Module({
  imports: [
    // Load environment variables
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // Firebase module (Firestore + Storage + Auth)
    FirebaseModule,

    // Feature modules
    DashboardModule,
    StudentsModule,
    CompaniesModule,
    InternshipsModule,
    ApplicationsModule,
    EnrollmentsModule,
    AdminsModule,
    AssignmentsModule,
    AiModule,
  ],
  controllers: [AppController, CompanyAuthController],
  providers: [AppService],
})
export class AppModule {}
