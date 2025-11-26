import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import * as admin from 'firebase-admin';

@Injectable()
export class StudentsService {
  constructor(private firebaseService: FirebaseService) {}

  async findAll() {
    try {
      const firestore = this.firebaseService.firestore;
      
      // Fetch all students in parallel with applications count
      const [studentsSnapshot, applicationsSnapshot] = await Promise.all([
        firestore.collection('students').get(),
        firestore.collection('applications').get(),
      ]);
      
      // Build application count map
      const applicationCountMap = new Map<string, number>();
      applicationsSnapshot.docs.forEach((doc) => {
        const studentId = doc.data().studentId;
        if (studentId) {
          applicationCountMap.set(
            studentId,
            (applicationCountMap.get(studentId) || 0) + 1
          );
        }
      });

      // Map students with their application counts
      const students = studentsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        applicationsCount: applicationCountMap.get(doc.id) || 0,
      }));

      return students;
    } catch (error) {
      console.error('Error fetching students:', error);
      throw new Error('Failed to fetch students');
    }
  }

  async findAllMinimal() {
    try {
      const firestore = this.firebaseService.firestore;
      const studentsSnapshot = await firestore
        .collection('students')
        .select('fullName', 'email')
        .get();
      
      const students: any[] = [];
      for (const doc of studentsSnapshot.docs) {
        const data = doc.data();
        students.push({
          id: doc.id,
          fullName: data.fullName || 'Unknown',
          email: data.email || '',
        });
      }

      return students;
    } catch (error) {
      console.error('Error fetching students (minimal):', error);
      throw new Error('Failed to fetch students');
    }
  }

  async findOne(id: string) {
    try {
      const firestore = this.firebaseService.firestore;
      const docRef = firestore.collection('students').doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        throw new Error('Student not found');
      }

      // Get applications count
      const applicationsSnapshot = await firestore
        .collection('applications')
        .where('studentId', '==', id)
        .count()
        .get();

      return {
        id: doc.id,
        ...doc.data(),
        applicationsCount: applicationsSnapshot.data().count,
      };
    } catch (error) {
      console.error('Error fetching student:', error);
      throw new Error('Failed to fetch student');
    }
  }

  async create(createStudentDto: any) {
    try {
      const firestore = this.firebaseService.firestore;
      const auth = this.firebaseService.auth;

      // Create user in Firebase Auth
      const userRecord = await auth.createUser({
        email: createStudentDto.email,
        password: createStudentDto.password,
        displayName: createStudentDto.fullName,
      });

      // Create student document in Firestore
      const studentId = createStudentDto.email.replace(/[@.]/g, '_');
      const studentData = {
        email: createStudentDto.email,
        fullName: createStudentDto.fullName,
        major: createStudentDto.major,
        profilePhotoUrl: createStudentDto.profilePhotoUrl || '',
        cvUrl: createStudentDto.cvUrl || createStudentDto.resumeUrl || '',
        status: createStudentDto.status || 'active',
        role: 'student',
        uid: userRecord.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await firestore.collection('students').doc(studentId).set(studentData);

      return {
        id: studentId,
        ...studentData,
      };
    } catch (error) {
      console.error('Error creating student:', error);
      
      if (error.code === 'auth/email-already-exists') {
        throw new Error('This email is already registered');
      }
      
      throw new Error('Failed to create student');
    }
  }

  async update(id: string, updateStudentDto: any) {
    try {
      const firestore = this.firebaseService.firestore;
      const docRef = firestore.collection('students').doc(id);
      
      const doc = await docRef.get();
      if (!doc.exists) {
        throw new Error('Student not found');
      }

      const updateData = {
        fullName: updateStudentDto.fullName,
        major: updateStudentDto.major,
        profilePhotoUrl: updateStudentDto.profilePhotoUrl,
        cvUrl: updateStudentDto.cvUrl || updateStudentDto.resumeUrl,
        status: updateStudentDto.status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Remove undefined fields
      Object.keys(updateData).forEach(key => 
        updateData[key] === undefined && delete updateData[key]
      );

      await docRef.update(updateData);

      return {
        id,
        ...doc.data(),
        ...updateData,
      };
    } catch (error) {
      console.error('Error updating student:', error);
      throw new Error('Failed to update student');
    }
  }

  async remove(id: string) {
    try {
      const firestore = this.firebaseService.firestore;
      const auth = this.firebaseService.auth;
      
      const docRef = firestore.collection('students').doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        throw new Error('Student not found');
      }

      const studentData = doc.data();

      // Delete from Firebase Auth if uid exists
      if (studentData && studentData.uid) {
        try {
          await auth.deleteUser(studentData.uid);
        } catch (authError) {
          console.error('Error deleting user from Auth:', authError);
          // Continue with Firestore deletion even if Auth deletion fails
        }
      }

      // Delete from Firestore
      await docRef.delete();

      return { message: 'Student deleted successfully' };
    } catch (error) {
      console.error('Error deleting student:', error);
      throw new Error('Failed to delete student');
    }
  }
}

