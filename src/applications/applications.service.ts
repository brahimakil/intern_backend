import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import * as admin from 'firebase-admin';

export interface CreateApplicationDto {
  studentId: string;
  internshipId: string;
  companyId: string;
  status?: 'pending' | 'accepted' | 'rejected';
  coverLetter?: string;
  resumeUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  projectDescription?: string;
  notes?: string;
}

export interface UpdateApplicationDto {
  status?: 'pending' | 'accepted' | 'rejected';
  coverLetter?: string;
  resumeUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  projectDescription?: string;
  notes?: string;
}

@Injectable()
export class ApplicationsService {
  constructor(private firebaseService: FirebaseService) {}

  async findAll() {
    try {
      const firestore = this.firebaseService.firestore;
      const applicationsSnapshot = await firestore
        .collection('applications')
        .orderBy('createdAt', 'desc')
        .get();

      // Collect all unique IDs
      const studentIds = new Set<string>();
      const internshipIds = new Set<string>();
      const companyIds = new Set<string>();

      applicationsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.studentId) studentIds.add(data.studentId);
        if (data.internshipId) internshipIds.add(data.internshipId);
        if (data.companyId) companyIds.add(data.companyId);
      });

      // Batch fetch all related data in parallel
      const [studentsSnapshot, internshipsSnapshot, companiesSnapshot] = await Promise.all([
        studentIds.size > 0 ? firestore.collection('students').get() : Promise.resolve({ docs: [] } as any),
        internshipIds.size > 0 ? firestore.collection('internships').get() : Promise.resolve({ docs: [] } as any),
        companyIds.size > 0 ? firestore.collection('companies').get() : Promise.resolve({ docs: [] } as any),
      ]);

      // Build lookup maps
      const studentsMap = new Map();
      studentsSnapshot.docs?.forEach?.((doc: any) => {
        const data = doc.data();
        studentsMap.set(doc.id, {
          id: doc.id,
          fullName: data?.fullName || 'Unknown Student',
          email: data?.email || '',
        });
      });

      const internshipsMap = new Map();
      internshipsSnapshot.docs?.forEach?.((doc: any) => {
        const data = doc.data();
        internshipsMap.set(doc.id, {
          id: doc.id,
          title: data?.title || 'Unknown Internship',
        });
      });

      const companiesMap = new Map();
      companiesSnapshot.docs?.forEach?.((doc: any) => {
        const data = doc.data();
        companiesMap.set(doc.id, {
          id: doc.id,
          name: data?.name || 'Unknown Company',
        });
      });

      // Map applications with related data
      const applications: any[] = applicationsSnapshot.docs.map(doc => {
        const data = doc.data();
        
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || data.createdAt,
          updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
          student: data.studentId ? studentsMap.get(data.studentId) || null : null,
          internship: data.internshipId ? internshipsMap.get(data.internshipId) || null : null,
          company: data.companyId ? companiesMap.get(data.companyId) || null : null,
        };
      });

      return applications;
    } catch (error) {
      console.error('Error fetching applications:', error);
      throw new Error('Failed to fetch applications');
    }
  }

  async findOneMinimal(id: string) {
    console.log(`🔍 Fetching application (minimal): ${id}`);
    const startTime = Date.now();
    
    try {
      const firestore = this.firebaseService.firestore;
      const docRef = firestore.collection('applications').doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        throw new Error('Application not found');
      }

      const data = doc.data();
      
      if (!data) {
        throw new Error('Application data is undefined');
      }

      console.log(`✅ Application fetched in ${Date.now() - startTime}ms (no joins)`);

      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
      };
    } catch (error) {
      console.error('❌ Error fetching application:', error);
      throw new Error('Failed to fetch application');
    }
  }

  async findOne(id: string) {
    console.log(`🔍 Fetching application: ${id}`);
    const startTime = Date.now();
    
    try {
      const firestore = this.firebaseService.firestore;
      const docRef = firestore.collection('applications').doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        throw new Error('Application not found');
      }

      const data = doc.data();
      
      if (!data) {
        throw new Error('Application data is undefined');
      }

      console.log(`✅ Base application fetched in ${Date.now() - startTime}ms`);
      const joinStartTime = Date.now();

      // Fetch related data in parallel for speed
      const [studentData, internshipData, companyData] = await Promise.all([
        // Fetch student details
        data.studentId
          ? firestore.collection('students').doc(data.studentId).get()
              .then(doc => doc.exists ? { id: doc.id, ...doc.data() } : null)
              .catch(err => { console.error('Error fetching student:', err); return null; })
          : Promise.resolve(null),
        
        // Fetch internship details
        data.internshipId
          ? firestore.collection('internships').doc(data.internshipId).get()
              .then(doc => doc.exists ? { id: doc.id, ...doc.data() } : null)
              .catch(err => { console.error('Error fetching internship:', err); return null; })
          : Promise.resolve(null),
        
        // Fetch company details
        data.companyId
          ? firestore.collection('companies').doc(data.companyId).get()
              .then(doc => doc.exists ? { id: doc.id, ...doc.data() } : null)
              .catch(err => { console.error('Error fetching company:', err); return null; })
          : Promise.resolve(null),
      ]);

      console.log(`✅ Related data fetched in ${Date.now() - joinStartTime}ms`);
      console.log(`⏱️ Total time: ${Date.now() - startTime}ms`);

      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
        student: studentData,
        internship: internshipData,
        company: companyData,
      };
    } catch (error) {
      console.error('❌ Error fetching application:', error);
      throw new Error('Failed to fetch application');
    }
  }

  async create(createApplicationDto: CreateApplicationDto) {
    try {
      const firestore = this.firebaseService.firestore;
      const now = admin.firestore.Timestamp.now();

      const applicationData = {
        ...createApplicationDto,
        status: createApplicationDto.status || 'pending',
        createdAt: now,
        updatedAt: now,
      };

      const docRef = await firestore
        .collection('applications')
        .add(applicationData);

      return {
        id: docRef.id,
        ...applicationData,
        createdAt: now.toDate(),
        updatedAt: now.toDate(),
      };
    } catch (error) {
      console.error('Error creating application:', error);
      throw new Error('Failed to create application');
    }
  }

  async update(id: string, updateApplicationDto: UpdateApplicationDto) {
    try {
      const firestore = this.firebaseService.firestore;
      const docRef = firestore.collection('applications').doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        throw new Error('Application not found');
      }

      const now = admin.firestore.Timestamp.now();
      const updateData = {
        ...updateApplicationDto,
        updatedAt: now,
      };

      await docRef.update(updateData);

      return {
        id: doc.id,
        ...doc.data(),
        ...updateData,
        updatedAt: now.toDate(),
      };
    } catch (error) {
      console.error('Error updating application:', error);
      throw new Error('Failed to update application');
    }
  }

  async updateStatus(id: string, status: 'pending' | 'accepted' | 'rejected') {
    try {
      const firestore = this.firebaseService.firestore;
      const docRef = firestore.collection('applications').doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        throw new Error('Application not found');
      }

      const now = admin.firestore.Timestamp.now();
      await docRef.update({
        status,
        updatedAt: now,
      });

      return {
        id: doc.id,
        ...doc.data(),
        status,
        updatedAt: now.toDate(),
      };
    } catch (error) {
      console.error('Error updating application status:', error);
      throw new Error('Failed to update application status');
    }
  }

  async remove(id: string) {
    try {
      const firestore = this.firebaseService.firestore;
      const docRef = firestore.collection('applications').doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        throw new Error('Application not found');
      }

      await docRef.delete();

      return { message: 'Application deleted successfully' };
    } catch (error) {
      console.error('Error deleting application:', error);
      throw new Error('Failed to delete application');
    }
  }

  async findByStudent(studentId: string) {
    try {
      const firestore = this.firebaseService.firestore;
      const applicationsSnapshot = await firestore
        .collection('applications')
        .where('studentId', '==', studentId)
        .orderBy('createdAt', 'desc')
        .get();

      const applications: any[] = [];
      
      for (const doc of applicationsSnapshot.docs) {
        const data = doc.data();
        
        // Fetch internship details
        let internshipData: any = null;
        if (data.internshipId) {
          const internshipDoc = await firestore
            .collection('internships')
            .doc(data.internshipId)
            .get();
          if (internshipDoc.exists) {
            internshipData = {
              id: internshipDoc.id,
              title: internshipDoc.data()?.title || 'Unknown Internship',
            };
          }
        }

        // Fetch company details
        let companyData: any = null;
        if (data.companyId) {
          const companyDoc = await firestore
            .collection('companies')
            .doc(data.companyId)
            .get();
          if (companyDoc.exists) {
            companyData = {
              id: companyDoc.id,
              name: companyDoc.data()?.name || 'Unknown Company',
            };
          }
        }

        applications.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || data.createdAt,
          updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
          internship: internshipData,
          company: companyData,
        });
      }

      return applications;
    } catch (error) {
      console.error('Error fetching student applications:', error);
      throw new Error('Failed to fetch student applications');
    }
  }

  async findByInternship(internshipId: string) {
    try {
      const firestore = this.firebaseService.firestore;
      const applicationsSnapshot = await firestore
        .collection('applications')
        .where('internshipId', '==', internshipId)
        .orderBy('createdAt', 'desc')
        .get();

      const applications: any[] = [];
      
      for (const doc of applicationsSnapshot.docs) {
        const data = doc.data();
        
        // Fetch student details
        let studentData: any = null;
        if (data.studentId) {
          const studentDoc = await firestore
            .collection('students')
            .doc(data.studentId)
            .get();
          if (studentDoc.exists) {
            studentData = {
              id: studentDoc.id,
              fullName: studentDoc.data()?.fullName || 'Unknown Student',
              email: studentDoc.data()?.email || '',
            };
          }
        }

        applications.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || data.createdAt,
          updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
          student: studentData,
        });
      }

      return applications;
    } catch (error) {
      console.error('Error fetching internship applications:', error);
      throw new Error('Failed to fetch internship applications');
    }
  }
}
