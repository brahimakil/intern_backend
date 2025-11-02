import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';

@Injectable()
export class DashboardService {
  constructor(private firebaseService: FirebaseService) {}

  async getStats() {
    const firestore = this.firebaseService.firestore;

    try {
      // Calculate date thresholds
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const fiveWeeksAgo = new Date();
      fiveWeeksAgo.setDate(fiveWeeksAgo.getDate() - 35);

      // Run ALL count queries in parallel for maximum speed!
      const [
        studentsSnapshot,
        companiesSnapshot,
        internshipsSnapshot,
        applicationsSnapshot,
        pendingSnapshot,
        acceptedSnapshot,
        rejectedSnapshot,
        recentAppsSnapshot,
        recentActivitiesSnapshot,
        trendsSnapshot
      ] = await Promise.all([
        firestore.collection('students').count().get(),
        firestore.collection('companies').where('status', '==', 'active').count().get(),
        firestore.collection('internships').where('status', '==', 'open').count().get(),
        firestore.collection('applications').count().get(),
        firestore.collection('applications').where('status', '==', 'pending').count().get(),
        firestore.collection('applications').where('status', '==', 'accepted').count().get(),
        firestore.collection('applications').where('status', '==', 'rejected').count().get(),
        firestore.collection('applications').where('createdAt', '>=', sevenDaysAgo).count().get(),
        firestore.collection('applications').orderBy('createdAt', 'desc').limit(10).get(),
        firestore.collection('applications').where('createdAt', '>=', fiveWeeksAgo).select('createdAt').get(),
      ]);

      // Extract counts
      const totalStudents = studentsSnapshot.data().count;
      const activeCompanies = companiesSnapshot.data().count;
      const openInternships = internshipsSnapshot.data().count;
      const totalApplications = applicationsSnapshot.data().count;
      const pendingApplications = pendingSnapshot.data().count;
      const acceptedApplications = acceptedSnapshot.data().count;
      const rejectedApplications = rejectedSnapshot.data().count;
      const recentApplications = recentAppsSnapshot.data().count;

      // Get unique student and internship IDs from recent activities
      const studentIds = new Set<string>();
      const internshipIds = new Set<string>();
      
      recentActivitiesSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (data.studentId) studentIds.add(data.studentId);
        if (data.internshipId) internshipIds.add(data.internshipId);
      });

      // Fetch all related students and internships in parallel
      const [studentsData, internshipsData] = await Promise.all([
        Promise.all(
          Array.from(studentIds).map(async (id) => {
            try {
              const doc = await firestore.collection('students').doc(id).get();
              if (doc.exists) {
                const data = doc.data();
                if (data) {
                  const firstName = data.firstName || '';
                  const lastName = data.lastName || '';
                  const fullName = data.fullName || `${firstName} ${lastName}`.trim();
                  return { 
                    id, 
                    name: fullName || 'Unknown Student'
                  };
                }
              }
            } catch (err) {
              console.error(`Error fetching student ${id}:`, err);
            }
            return { id, name: 'Unknown Student' };
          })
        ),
        Promise.all(
          Array.from(internshipIds).map(async (id) => {
            try {
              const doc = await firestore.collection('internships').doc(id).get();
              if (doc.exists) {
                const data = doc.data();
                return { id, title: data?.title || 'Unknown Position' };
              }
            } catch (err) {
              console.error(`Error fetching internship ${id}:`, err);
            }
            return { id, title: 'Unknown Position' };
          })
        ),
      ]);

      // Create lookup maps
      const studentMap = new Map(studentsData.map(s => [s.id, s.name]));
      const internshipMap = new Map(internshipsData.map(i => [i.id, i.title]));

      // Build activities array
      const recentActivities = recentActivitiesSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          type: 'application',
          studentName: studentMap.get(data.studentId) || 'Unknown Student',
          internshipTitle: internshipMap.get(data.internshipId) || 'Unknown Position',
          status: data.status,
          date: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
        };
      });

      // Process application trends from the already-fetched data
      const now = new Date();

      // Initialize arrays
      const weeklyTrends: number[] = [0, 0, 0, 0, 0];
      const weekLabels: string[] = [];
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      // Generate labels
      for (let i = 0; i < 5; i++) {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - (7 * (i + 1)));
        weekLabels[4 - i] = `${monthNames[weekStart.getMonth()]} ${weekStart.getDate()}`;
      }

      // Count applications per week
      trendsSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
        const daysAgo = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
        const weekIndex = Math.min(4, Math.floor(daysAgo / 7));
        if (weekIndex >= 0 && weekIndex < 5) {
          weeklyTrends[4 - weekIndex]++;
        }
      });

      return {
        totalStudents,
        activeCompanies,
        openInternships,
        totalApplications,
        pendingApplications,
        acceptedApplications,
        rejectedApplications,
        recentApplications,
        recentActivities,
        applicationTrends: weeklyTrends,
        trendLabels: weekLabels,
      };
    } catch (error) {
      console.error('Error fetching stats from Firestore:', error);
      return {
        totalStudents: 0,
        activeCompanies: 0,
        openInternships: 0,
        totalApplications: 0,
        pendingApplications: 0,
        acceptedApplications: 0,
        rejectedApplications: 0,
        recentApplications: 0,
        recentActivities: [],
        applicationTrends: [0, 0, 0, 0, 0],
      };
    }
  }
}
