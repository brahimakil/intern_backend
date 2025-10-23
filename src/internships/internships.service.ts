import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import * as admin from 'firebase-admin';

@Injectable()
export class InternshipsService {
  constructor(private firebaseService: FirebaseService) {}

  async findAll() {
    try {
      const firestore = this.firebaseService.firestore;
      const internshipsSnapshot = await firestore.collection('internships').get();
      
      const internships: any[] = [];
      for (const doc of internshipsSnapshot.docs) {
        const data = doc.data();
        
        // Fetch company details
        let companyName = 'Unknown Company';
        let companyLogo = '';
        
        if (data.companyId) {
          try {
            const companyDoc = await firestore.collection('companies').doc(data.companyId).get();
            if (companyDoc.exists) {
              const companyData = companyDoc.data();
              if (companyData) {
                companyName = companyData.name || companyName;
                companyLogo = companyData.logoUrl || '';
              }
            }
          } catch (err) {
            console.error('Error fetching company:', err);
          }
        }

        // Get applicants count
        const applicationsSnapshot = await firestore
          .collection('applications')
          .where('internshipId', '==', doc.id)
          .count()
          .get();

        internships.push({
          id: doc.id,
          ...data,
          companyName,
          companyLogo,
          applicantsCount: applicationsSnapshot.data().count,
        });
      }

      return internships;
    } catch (error) {
      console.error('Error fetching internships:', error);
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

      // Get applicants count
      const applicationsSnapshot = await firestore
        .collection('applications')
        .where('internshipId', '==', id)
        .count()
        .get();

      return {
        id: doc.id,
        ...data,
        companyName,
        companyEmail,
        companyLogo,
        applicantsCount: applicationsSnapshot.data().count,
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

