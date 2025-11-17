import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';

@Injectable()
export class CompanyDashboardService {
  constructor(private firebaseService: FirebaseService) {}

  async getCompanyStats(companyId: string) {
    const firestore = this.firebaseService.firestore;

    try {
      // Get all internships for this company
      const internshipsSnapshot = await firestore
        .collection('internships')
        .where('companyId', '==', companyId)
        .get();

      const internshipIds = internshipsSnapshot.docs.map(doc => doc.id);
      
      if (internshipIds.length === 0) {
        return {
          totalInternships: 0,
          totalApplications: 0,
          acceptedApplications: 0,
          enrolledStudents: 0,
        };
      }

      // Run queries in parallel for all company's internships
      const [
        applicationsSnapshot,
        acceptedAppsSnapshot,
        enrollmentsSnapshot,
      ] = await Promise.all([
        // Total applications to company's internships
        firestore
          .collection('applications')
          .where('internshipId', 'in', internshipIds.slice(0, 10)) // Firestore limit
          .count()
          .get(),
        
        // Accepted applications
        firestore
          .collection('applications')
          .where('internshipId', 'in', internshipIds.slice(0, 10))
          .where('status', '==', 'accepted')
          .count()
          .get(),
        
        // Enrolled students (accepted enrollments)
        firestore
          .collection('enrollments')
          .where('internshipId', 'in', internshipIds.slice(0, 10))
          .where('status', '==', 'accepted')
          .count()
          .get(),
      ]);

      // If company has more than 10 internships, we need to batch the queries
      let totalApplications = applicationsSnapshot.data().count;
      let acceptedApplications = acceptedAppsSnapshot.data().count;
      let enrolledStudents = enrollmentsSnapshot.data().count;

      if (internshipIds.length > 10) {
        // Process remaining internships in batches of 10
        for (let i = 10; i < internshipIds.length; i += 10) {
          const batch = internshipIds.slice(i, i + 10);
          
          const [appsCount, acceptedCount, enrolledCount] = await Promise.all([
            firestore.collection('applications').where('internshipId', 'in', batch).count().get(),
            firestore.collection('applications').where('internshipId', 'in', batch).where('status', '==', 'accepted').count().get(),
            firestore.collection('enrollments').where('internshipId', 'in', batch).where('status', '==', 'accepted').count().get(),
          ]);

          totalApplications += appsCount.data().count;
          acceptedApplications += acceptedCount.data().count;
          enrolledStudents += enrolledCount.data().count;
        }
      }

      return {
        totalInternships: internshipIds.length,
        totalApplications,
        acceptedApplications,
        totalEnrollments: enrolledStudents,
        acceptedEnrollments: enrolledStudents,
      };
    } catch (error) {
      console.error('Error fetching company dashboard stats:', error);
      throw new Error('Failed to fetch company dashboard statistics');
    }
  }
}
