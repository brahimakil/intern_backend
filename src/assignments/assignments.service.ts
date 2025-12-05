import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import * as admin from 'firebase-admin';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { SubmitAssignmentDto } from './dto/submit-assignment.dto';
import { ReviewAssignmentDto } from './dto/review-assignment.dto';

@Injectable()
export class AssignmentsService {
  constructor(private firebaseService: FirebaseService) {}

  async findAll() {
    try {
      const firestore = this.firebaseService.firestore;
      
      // Fetch all assignments and related data in parallel
      const [assignmentsSnapshot, studentsSnapshot, internshipsSnapshot, companiesSnapshot] = await Promise.all([
        firestore.collection('assignments').orderBy('createdAt', 'desc').get(),
        firestore.collection('students').get(),
        firestore.collection('internships').get(),
        firestore.collection('companies').get(),
      ]);

      // Build lookup maps
      const studentsMap = new Map();
      for (const doc of studentsSnapshot.docs) {
        const data = doc.data();
        studentsMap.set(doc.id, {
          fullName: data?.fullName || 'Unknown',
          email: data?.email || 'N/A',
        });
      }

      const internshipsMap = new Map();
      for (const doc of internshipsSnapshot.docs) {
        const data = doc.data();
        internshipsMap.set(doc.id, {
          title: data?.title || 'Unknown',
        });
      }

      const companiesMap = new Map();
      for (const doc of companiesSnapshot.docs) {
        companiesMap.set(doc.id, doc.data()?.name || 'Unknown');
      }

      // Map assignments with related data
      const assignments = assignmentsSnapshot.docs.map((doc) => {
        const data = doc.data();
        const student = studentsMap.get(data.studentId);
        const internship = internshipsMap.get(data.internshipId);
        const company = companiesMap.get(data.companyId);
        
        return {
          id: doc.id,
          ...data,
          studentName: student?.fullName || 'Unknown',
          studentEmail: student?.email || 'N/A',
          internshipTitle: internship?.title || 'Unknown',
          companyName: company || 'Unknown',
          dueDate: data.dueDate?.toDate ? data.dueDate.toDate().toISOString() : data.dueDate,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
        };
      });

      return assignments;
    } catch (error) {
      console.error('Error fetching assignments:', error);
      throw new Error('Failed to fetch assignments');
    }
  }

  async findOne(id: string) {
    try {
      const firestore = this.firebaseService.firestore;
      const docRef = firestore.collection('assignments').doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        throw new Error('Assignment not found');
      }

      const data = doc.data();
      if (!data) {
        throw new Error('Assignment data not found');
      }

      // Fetch related data in parallel
      const [studentDoc, internshipDoc, companyDoc] = await Promise.all([
        firestore.collection('students').doc(data.studentId).get(),
        firestore.collection('internships').doc(data.internshipId).get(),
        firestore.collection('companies').doc(data.companyId).get(),
      ]);

      return {
        id: doc.id,
        ...data,
        studentName: studentDoc.exists ? studentDoc.data()?.fullName || 'Unknown' : 'Unknown',
        studentEmail: studentDoc.exists ? studentDoc.data()?.email || 'N/A' : 'N/A',
        internshipTitle: internshipDoc.exists ? internshipDoc.data()?.title || 'Unknown' : 'Unknown',
        companyName: companyDoc.exists ? companyDoc.data()?.name || 'Unknown' : 'Unknown',
        dueDate: data.dueDate?.toDate ? data.dueDate.toDate().toISOString() : data.dueDate,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
      };
    } catch (error) {
      console.error('Error fetching assignment:', error);
      throw new Error('Failed to fetch assignment');
    }
  }

  async findByStudent(studentId: string) {
    try {
      const firestore = this.firebaseService.firestore;
      
      const [assignmentsSnapshot, internshipsSnapshot, companiesSnapshot] = await Promise.all([
        firestore.collection('assignments').where('studentId', '==', studentId).orderBy('dueDate', 'asc').get(),
        firestore.collection('internships').get(),
        firestore.collection('companies').get(),
      ]);

      const internshipsMap = new Map();
      for (const doc of internshipsSnapshot.docs) {
        const data = doc.data();
        internshipsMap.set(doc.id, {
          title: data?.title || 'Unknown',
        });
      }

      const companiesMap = new Map();
      for (const doc of companiesSnapshot.docs) {
        companiesMap.set(doc.id, doc.data()?.name || 'Unknown');
      }

      const assignments = assignmentsSnapshot.docs.map((doc) => {
        const data = doc.data();
        const internship = internshipsMap.get(data.internshipId);
        const company = companiesMap.get(data.companyId);
        
        return {
          id: doc.id,
          ...data,
          internshipTitle: internship?.title || 'Unknown',
          companyName: company || 'Unknown',
          dueDate: data.dueDate?.toDate ? data.dueDate.toDate().toISOString() : data.dueDate,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
        };
      });

      return assignments;
    } catch (error) {
      console.error('Error fetching student assignments:', error);
      throw new Error('Failed to fetch student assignments');
    }
  }

  async findByInternship(internshipId: string) {
    try {
      const firestore = this.firebaseService.firestore;
      
      const [assignmentsSnapshot, studentsSnapshot] = await Promise.all([
        firestore.collection('assignments').where('internshipId', '==', internshipId).orderBy('createdAt', 'desc').get(),
        firestore.collection('students').get(),
      ]);

      const studentsMap = new Map();
      for (const doc of studentsSnapshot.docs) {
        const data = doc.data();
        studentsMap.set(doc.id, {
          fullName: data?.fullName || 'Unknown',
          email: data?.email || 'N/A',
        });
      }

      const assignments = assignmentsSnapshot.docs.map((doc) => {
        const data = doc.data();
        const student = studentsMap.get(data.studentId);
        
        return {
          id: doc.id,
          ...data,
          studentName: student?.fullName || 'Unknown',
          studentEmail: student?.email || 'N/A',
          dueDate: data.dueDate?.toDate ? data.dueDate.toDate().toISOString() : data.dueDate,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
        };
      });

      return assignments;
    } catch (error) {
      console.error('Error fetching internship assignments:', error);
      throw new Error('Failed to fetch internship assignments');
    }
  }

  async create(createAssignmentDto: CreateAssignmentDto) {
    try {
      const firestore = this.firebaseService.firestore;

      const assignmentData = {
        internshipId: createAssignmentDto.internshipId,
        studentId: createAssignmentDto.studentId,
        companyId: createAssignmentDto.companyId,
        title: createAssignmentDto.title,
        description: createAssignmentDto.description,
        dueDate: createAssignmentDto.dueDate,
        status: createAssignmentDto.status || 'assigned',
        submissionUrl: '',
        submissionNotes: '',
        reviewNotes: '',
        score: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const docRef = await firestore.collection('assignments').add(assignmentData);

      return {
        id: docRef.id,
        ...assignmentData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error creating assignment:', error);
      throw new Error('Failed to create assignment');
    }
  }

  async update(id: string, updateAssignmentDto: UpdateAssignmentDto) {
    try {
      const firestore = this.firebaseService.firestore;
      const docRef = firestore.collection('assignments').doc(id);
      
      const doc = await docRef.get();
      if (!doc.exists) {
        throw new Error('Assignment not found');
      }

      const updateData = {
        ...updateAssignmentDto,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await docRef.update(updateData);

      const updatedDoc = await docRef.get();
      const data = updatedDoc.data();

      return {
        id,
        ...data,
        dueDate: data?.dueDate?.toDate ? data.dueDate.toDate().toISOString() : data?.dueDate,
        createdAt: data?.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data?.createdAt,
        updatedAt: data?.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error updating assignment:', error);
      throw new Error('Failed to update assignment');
    }
  }

  async submit(id: string, submitAssignmentDto: SubmitAssignmentDto) {
    try {
      const firestore = this.firebaseService.firestore;
      const docRef = firestore.collection('assignments').doc(id);
      
      const doc = await docRef.get();
      if (!doc.exists) {
        throw new Error('Assignment not found');
      }

      const updateData = {
        submissionUrl: submitAssignmentDto.submissionUrl,
        submissionNotes: submitAssignmentDto.submissionNotes || '',
        status: 'submitted',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await docRef.update(updateData);

      const updatedDoc = await docRef.get();
      const data = updatedDoc.data();

      return {
        id,
        ...data,
        dueDate: data?.dueDate?.toDate ? data.dueDate.toDate().toISOString() : data?.dueDate,
        createdAt: data?.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data?.createdAt,
        updatedAt: data?.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error submitting assignment:', error);
      throw new Error('Failed to submit assignment');
    }
  }

  async review(id: string, reviewAssignmentDto: ReviewAssignmentDto) {
    try {
      const firestore = this.firebaseService.firestore;
      const docRef = firestore.collection('assignments').doc(id);
      
      const doc = await docRef.get();
      if (!doc.exists) {
        throw new Error('Assignment not found');
      }

      const data = doc.data();
      if (data?.status !== 'submitted') {
        throw new Error('Assignment must be submitted before review');
      }

      const updateData = {
        reviewNotes: reviewAssignmentDto.reviewNotes,
        score: reviewAssignmentDto.score || null,
        status: 'reviewed',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await docRef.update(updateData);

      const updatedDoc = await docRef.get();
      const updatedData = updatedDoc.data();

      return {
        id,
        ...updatedData,
        dueDate: updatedData?.dueDate?.toDate ? updatedData.dueDate.toDate().toISOString() : updatedData?.dueDate,
        createdAt: updatedData?.createdAt?.toDate ? updatedData.createdAt.toDate().toISOString() : updatedData?.createdAt,
        updatedAt: updatedData?.updatedAt?.toDate ? updatedData.updatedAt.toDate().toISOString() : new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error reviewing assignment:', error);
      throw error;
    }
  }

  async delete(id: string) {
    try {
      const firestore = this.firebaseService.firestore;
      const docRef = firestore.collection('assignments').doc(id);
      
      const doc = await docRef.get();
      if (!doc.exists) {
        throw new Error('Assignment not found');
      }

      await docRef.delete();

      return { message: 'Assignment deleted successfully' };
    } catch (error) {
      console.error('Error deleting assignment:', error);
      throw new Error('Failed to delete assignment');
    }
  }
}
