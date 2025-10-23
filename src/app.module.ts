import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FirebaseModule } from './firebase/firebase.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { StudentsModule } from './students/students.module';
import { CompaniesModule } from './companies/companies.module';
import { InternshipsModule } from './internships/internships.module';

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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
