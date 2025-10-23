import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';

@Injectable()
export class DashboardService {
  constructor(private firebaseService: FirebaseService) {}

  async getStats() {
    const firestore = this.firebaseService.firestore;

    try {
      // Get total students count from students collection
      const studentsSnapshot = await firestore.collection('students').count().get();
      const totalStudents = studentsSnapshot.data().count;

      // Get active companies count
      const companiesSnapshot = await firestore.collection('companies').where('status', '==', 'active').count().get();
      const activeCompanies = companiesSnapshot.data().count;

      // Get open internships count
      const internshipsSnapshot = await firestore.collection('internships').where('status', '==', 'open').count().get();
      const openInternships = internshipsSnapshot.data().count;

      // Get total applications count
      const applicationsSnapshot = await firestore.collection('applications').count().get();
      const totalApplications = applicationsSnapshot.data().count;

      return {
        totalStudents,
        activeCompanies,
        openInternships,
        totalApplications,
      };
    } catch (error) {
      console.error('Error fetching stats from Firestore:', error);
      return {
        totalStudents: 0,
        activeCompanies: 0,
        openInternships: 0,
        totalApplications: 0,
      };
    }
  }
}
