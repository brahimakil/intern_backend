import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import * as admin from 'firebase-admin';

@Injectable()
export class InternshipsService {
  constructor(private firebaseService: FirebaseService) {}

  async findAll() {
    try {
      const firestore = this.firebaseService.firestore;
      
      // Fetch all data in parallel
      const [internshipsSnapshot, companiesSnapshot, applicationsSnapshot, enrollmentsSnapshot] = await Promise.all([
        firestore.collection('internships').get(),
        firestore.collection('companies').get(),
        firestore.collection('applications').get(),
        firestore.collection('enrollments').get(),
      ]);
      
      // Build company map
      const companyMap = new Map<string, any>();
      companiesSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        companyMap.set(doc.id, {
          name: data?.name || 'Unknown Company',
          logoUrl: data?.logoUrl || '',
        });
      });

      // Build applications count map
      const applicationsCountMap = new Map<string, number>();
      applicationsSnapshot.docs.forEach((doc) => {
        const internshipId = doc.data().internshipId;
        if (internshipId) {
          applicationsCountMap.set(
            internshipId,
            (applicationsCountMap.get(internshipId) || 0) + 1
          );
        }
      });

      // Build current students count map (from enrollments)
      const currentStudentsCountMap = new Map<string, number>();
      enrollmentsSnapshot.docs.forEach((doc) => {
        const internshipId = doc.data().internshipId;
        if (internshipId) {
          currentStudentsCountMap.set(
            internshipId,
            (currentStudentsCountMap.get(internshipId) || 0) + 1
          );
        }
      });

      // Map internships with company data and counts
      const internships = internshipsSnapshot.docs.map((doc) => {
        const data = doc.data();
        const company = companyMap.get(data.companyId) || {
          name: 'Unknown Company',
          logoUrl: '',
        };

        return {
          id: doc.id,
          ...data,
          companyName: company.name,
          companyLogo: company.logoUrl,
          applicationsCount: applicationsCountMap.get(doc.id) || 0,
          currentStudentsCount: currentStudentsCountMap.get(doc.id) || 0,
        };
      });

      return internships;
    } catch (error) {
      console.error('Error fetching internships:', error);
      throw new Error('Failed to fetch internships');
    }
  }

  async findAllMinimal() {
    try {
      const firestore = this.firebaseService.firestore;
      const internshipsSnapshot = await firestore
        .collection('internships')
        .select('title', 'companyId')
        .get();
      
      const internships: any[] = [];
      for (const doc of internshipsSnapshot.docs) {
        const data = doc.data();
        internships.push({
          id: doc.id,
          title: data.title || 'Unknown',
          companyId: data.companyId || '',
        });
      }

      return internships;
    } catch (error) {
      console.error('Error fetching internships (minimal):', error);
      throw new Error('Failed to fetch internships');
    }
  }

  async findOne(id: string) {
    try {
      const firestore = this.firebaseService.firestore;
      const docRef = firestore.collection('internships').doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        throw new Error('Internship not found');
      }

      const data = doc.data();

      if (!data) {
        throw new Error('Internship data not found');
      }

      // Fetch company details
      let companyName = 'Unknown Company';
      let companyEmail = '';
      let companyLogo = '';

      if (data.companyId) {
        try {
          const companyDoc = await firestore.collection('companies').doc(data.companyId).get();
          if (companyDoc.exists) {
            const companyData = companyDoc.data();
            if (companyData) {
              companyName = companyData.name || companyName;
              companyEmail = companyData.email || '';
              companyLogo = companyData.logoUrl || '';
            }
          }
        } catch (err) {
          console.error('Error fetching company:', err);
        }
      }

      // Get applications count and current enrolled students count
      const [applicationsSnapshot, enrollmentsSnapshot] = await Promise.all([
        firestore
          .collection('applications')
          .where('internshipId', '==', id)
          .count()
          .get(),
        firestore
          .collection('enrollments')
          .where('internshipId', '==', id)
          .get(),
      ]);

      return {
        id: doc.id,
        title: data.title,
        description: data.description,
        companyId: data.companyId,
        requiredSkills: data.requiredSkills,
        duration: data.duration,
        location: data.location,
        locationType: data.locationType,
        status: data.status,
        companyName,
        companyEmail,
        companyLogo,
        applicationsCount: applicationsSnapshot.data().count,
        currentStudentsCount: enrollmentsSnapshot.size,
        // Convert Firestore Timestamps to ISO strings
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString()),
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : (typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString()),
      };
    } catch (error) {
      console.error('Error fetching internship:', error);
      throw new Error('Failed to fetch internship');
    }
  }

  async create(createInternshipDto: any) {
    try {
      const firestore = this.firebaseService.firestore;

      const internshipId = `${createInternshipDto.companyId}_${Date.now()}`;
      const internshipData = {
        title: createInternshipDto.title,
        description: createInternshipDto.description,
        companyId: createInternshipDto.companyId,
        requiredSkills: createInternshipDto.requiredSkills || [],
        duration: createInternshipDto.duration,
        location: createInternshipDto.location,
        locationType: createInternshipDto.locationType,
        status: createInternshipDto.status || 'open',
        logoUrl: createInternshipDto.logoUrl || '',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await firestore.collection('internships').doc(internshipId).set(internshipData);

      return {
        id: internshipId,
        ...internshipData,
      };
    } catch (error) {
      console.error('Error creating internship:', error);
      throw new Error('Failed to create internship');
    }
  }

  async update(id: string, updateInternshipDto: any) {
    try {
      const firestore = this.firebaseService.firestore;
      const docRef = firestore.collection('internships').doc(id);
      
      const doc = await docRef.get();
      if (!doc.exists) {
        throw new Error('Internship not found');
      }

      const updateData = {
        title: updateInternshipDto.title,
        description: updateInternshipDto.description,
        requiredSkills: updateInternshipDto.requiredSkills,
        duration: updateInternshipDto.duration,
        location: updateInternshipDto.location,
        locationType: updateInternshipDto.locationType,
        status: updateInternshipDto.status,
        logoUrl: updateInternshipDto.logoUrl,
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
      console.error('Error updating internship:', error);
      throw new Error('Failed to update internship');
    }
  }

  async remove(id: string) {
    try {
      const firestore = this.firebaseService.firestore;
      const docRef = firestore.collection('internships').doc(id);
      
      const doc = await docRef.get();
      if (!doc.exists) {
        throw new Error('Internship not found');
      }

      await docRef.delete();

      return { message: 'Internship deleted successfully' };
    } catch (error) {
      console.error('Error deleting internship:', error);
      throw new Error('Failed to delete internship');
    }
  }
}

