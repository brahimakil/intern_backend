import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import * as admin from 'firebase-admin';

@Injectable()
export class EnrollmentsService {
  constructor(private firebaseService: FirebaseService) {}

  async findAll() {
    try {
      const firestore = this.firebaseService.firestore;
      
      // Fetch all data in parallel
      const [enrollmentsSnapshot, studentsSnapshot, internshipsSnapshot, companiesSnapshot] = await Promise.all([
        firestore.collection('enrollments').get(),
        firestore.collection('students').get(),
        firestore.collection('internships').select('title', 'companyId').get(),
        firestore.collection('companies').select('name').get(),
      ]);

      // Build lookup maps for faster access
      const studentsMap = new Map();
      studentsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        studentsMap.set(doc.id, {
          fullName: data?.fullName || 'Unknown',
          email: data?.email || 'N/A',
          resumeUrl: data?.resumeUrl || data?.cvUrl || null,
        });
      });

      // Note: We don't use application resumeUrl for enrollment CV display
      // The enrollment should show the student's actual CV, not application URLs

      const internshipsMap = new Map();
      internshipsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        internshipsMap.set(doc.id, {
          title: data?.title || 'Unknown',
          companyId: data?.companyId,
        });
      });

      const companiesMap = new Map();
      companiesSnapshot.docs.forEach(doc => {
        companiesMap.set(doc.id, doc.data()?.name || 'Unknown');
      });

      // Map enrollments with populated data
      const enrollments = enrollmentsSnapshot.docs.map((doc) => {
        const data = doc.data();
        const internship = internshipsMap.get(data.internshipId) || { title: 'Unknown', companyId: data.companyId };
        const student = studentsMap.get(data.studentId) || { fullName: 'Unknown', email: 'N/A', resumeUrl: null };
        
        return {
          id: doc.id,
          studentId: data.studentId,
          internshipId: data.internshipId,
          companyId: internship.companyId || data.companyId,
          status: data.status,
          studentName: student.fullName,
          studentEmail: student.email,
          studentResumeUrl: student.resumeUrl,
          internshipTitle: internship.title,
          companyName: companiesMap.get(internship.companyId || data.companyId) || 'Unknown',
          // Convert Firestore Timestamps to ISO strings
          enrolledDate: data.enrolledDate?.toDate ? data.enrolledDate.toDate().toISOString() : (typeof data.enrolledDate === 'string' ? data.enrolledDate : new Date().toISOString()),
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString()),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : (typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString()),
        };
      });

      return enrollments;
    } catch (error) {
      console.error('Error fetching enrollments:', error);
      throw new Error('Failed to fetch enrollments');
    }
  }

  async findOne(id: string) {
    try {
      const firestore = this.firebaseService.firestore;
      const docRef = firestore.collection('enrollments').doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        throw new Error('Enrollment not found');
      }

      const data = doc.data();
      if (!data) {
        throw new Error('Enrollment data not found');
      }

      return {
        id: doc.id,
        studentId: data.studentId,
        internshipId: data.internshipId,
        companyId: data.companyId,
        status: data.status,
        // Convert Firestore Timestamps to ISO strings
        enrolledDate: data.enrolledDate?.toDate ? data.enrolledDate.toDate().toISOString() : (typeof data.enrolledDate === 'string' ? data.enrolledDate : new Date().toISOString()),
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString()),
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : (typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString()),
      };
    } catch (error) {
      console.error('Error fetching enrollment:', error);
      throw new Error('Failed to fetch enrollment');
    }
  }

  async create(createEnrollmentDto: any) {
    try {
      const firestore = this.firebaseService.firestore;
      
      // Get current timestamp as ISO string
      const nowISO = new Date().toISOString();
      
      // First, get the internship to extract companyId
      const internshipDoc = await firestore.collection('internships').doc(createEnrollmentDto.internshipId).get();
      if (!internshipDoc.exists) {
        throw new Error('Internship not found');
      }
      const internshipData = internshipDoc.data();
      
      // Check for duplicate enrollment (same student + same internship)
      const existingEnrollments = await firestore
        .collection('enrollments')
        .where('studentId', '==', createEnrollmentDto.studentId)
        .where('internshipId', '==', createEnrollmentDto.internshipId)
        .get();
      
      if (!existingEnrollments.empty) {
        const existingEnrollment = existingEnrollments.docs[0].data();
        const status = existingEnrollment.status;
        
        if (status === 'rejected') {
          throw new Error('This student was previously rejected for this internship and cannot re-enroll');
        }
        throw new Error('This student is already enrolled in this internship');
      }
      
      const enrollmentData = {
        studentId: createEnrollmentDto.studentId,
        internshipId: createEnrollmentDto.internshipId,
        companyId: internshipData?.companyId || createEnrollmentDto.companyId,
        status: createEnrollmentDto.status || 'pending',
        enrolledDate: nowISO,
        createdAt: nowISO,
        updatedAt: nowISO,
      };

      const docRef = await firestore.collection('enrollments').add(enrollmentData);
      
      // Fetch related data for response in parallel
      const [studentDoc, companyDoc] = await Promise.all([
        firestore.collection('students').doc(enrollmentData.studentId).get(),
        firestore.collection('companies').doc(enrollmentData.companyId).get(),
      ]);

      return {
        id: docRef.id,
        ...enrollmentData,
        studentName: studentDoc.exists ? studentDoc.data()?.fullName : 'Unknown',
        internshipTitle: internshipData?.title || 'Unknown',
        companyName: companyDoc.exists ? companyDoc.data()?.name : 'Unknown',
      };
    } catch (error) {
      console.error('Error creating enrollment:', error);
      // Re-throw the original error to preserve the message
      throw error;
    }
  }

  async update(id: string, updateEnrollmentDto: any) {
    try {
      const firestore = this.firebaseService.firestore;
      const docRef = firestore.collection('enrollments').doc(id);
      
      const doc = await docRef.get();
      if (!doc.exists) {
        throw new Error('Enrollment not found');
      }

      const nowISO = new Date().toISOString();
      const updateData = {
        ...updateEnrollmentDto,
        updatedAt: nowISO,
      };

      await docRef.update(updateData);
      
      // Fetch updated document
      const updatedDoc = await docRef.get();
      const data = updatedDoc.data();
      
      if (!data) {
        throw new Error('Failed to retrieve updated enrollment');
      }

      return {
        id,
        studentId: data.studentId,
        internshipId: data.internshipId,
        companyId: data.companyId,
        status: data.status,
        enrolledDate: data.enrolledDate?.toDate ? data.enrolledDate.toDate().toISOString() : (typeof data.enrolledDate === 'string' ? data.enrolledDate : nowISO),
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (typeof data.createdAt === 'string' ? data.createdAt : nowISO),
        updatedAt: nowISO,
      };
    } catch (error) {
      console.error('Error updating enrollment:', error);
      throw new Error('Failed to update enrollment');
    }
  }

  async delete(id: string) {
    try {
      const firestore = this.firebaseService.firestore;
      const docRef = firestore.collection('enrollments').doc(id);
      
      const doc = await docRef.get();
      if (!doc.exists) {
        throw new Error('Enrollment not found');
      }

      await docRef.delete();

      return { message: 'Enrollment deleted successfully' };
    } catch (error) {
      console.error('Error deleting enrollment:', error);
      throw new Error('Failed to delete enrollment');
    }
  }

  async findByInternship(internshipId: string) {
    try {
      const firestore = this.firebaseService.firestore;
      
      // Fetch enrollments for this internship and related data in parallel
      const [enrollmentsSnapshot, studentsSnapshot] = await Promise.all([
        firestore.collection('enrollments').where('internshipId', '==', internshipId).get(),
        firestore.collection('students').get(),
      ]);

      // Build students lookup map
      const studentsMap = new Map();
      studentsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        studentsMap.set(doc.id, {
          fullName: data?.fullName || 'Unknown',
          email: data?.email || 'N/A',
          resumeUrl: data?.resumeUrl || data?.cvUrl || null,
        });
      });

      // Map enrollments with student data
      const enrollments = enrollmentsSnapshot.docs.map((doc) => {
        const data = doc.data();
        const student = studentsMap.get(data.studentId) || { fullName: 'Unknown', email: 'N/A', resumeUrl: null };
        
        return {
          id: doc.id,
          studentId: data.studentId,
          internshipId: data.internshipId,
          companyId: data.companyId,
          status: data.status,
          studentName: student.fullName,
          studentEmail: student.email,
          studentResumeUrl: student.resumeUrl,
          enrolledDate: data.enrolledDate?.toDate ? data.enrolledDate.toDate().toISOString() : (typeof data.enrolledDate === 'string' ? data.enrolledDate : new Date().toISOString()),
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString()),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : (typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString()),
        };
      });

      return enrollments;
    } catch (error) {
      console.error('Error fetching internship enrollments:', error);
      throw new Error('Failed to fetch internship enrollments');
    }
  }
}
