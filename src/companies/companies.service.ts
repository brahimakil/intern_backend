import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import * as admin from 'firebase-admin';

@Injectable()
export class CompaniesService {
  constructor(private firebaseService: FirebaseService) {}

  async findAll() {
    try {
      const firestore = this.firebaseService.firestore;
      
      // Fetch all companies in parallel with internships
      const [companiesSnapshot, internshipsSnapshot] = await Promise.all([
        firestore.collection('companies').get(),
        firestore.collection('internships').get(),
      ]);
      
      // Build internships count map
      const internshipsCountMap = new Map<string, number>();
      internshipsSnapshot.docs.forEach((doc) => {
        const companyId = doc.data().companyId;
        if (companyId) {
          internshipsCountMap.set(
            companyId,
            (internshipsCountMap.get(companyId) || 0) + 1
          );
        }
      });

      // Map companies with their internships counts
      const companies = companiesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        internshipsCount: internshipsCountMap.get(doc.id) || 0,
      }));

      return companies;
    } catch (error) {
      console.error('Error fetching companies:', error);
      throw new Error('Failed to fetch companies');
    }
  }

  async findAllMinimal() {
    try {
      const firestore = this.firebaseService.firestore;
      const companiesSnapshot = await firestore
        .collection('companies')
        .select('name')
        .get();
      
      const companies: any[] = [];
      for (const doc of companiesSnapshot.docs) {
        const data = doc.data();
        companies.push({
          id: doc.id,
          name: data.name || 'Unknown',
        });
      }

      return companies;
    } catch (error) {
      console.error('Error fetching companies (minimal):', error);
      throw new Error('Failed to fetch companies');
    }
  }

  async findOne(id: string) {
    try {
      const firestore = this.firebaseService.firestore;
      const docRef = firestore.collection('companies').doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        throw new Error('Company not found');
      }

      // Get internships count
      const internshipsSnapshot = await firestore
        .collection('internships')
        .where('companyId', '==', id)
        .count()
        .get();

      return {
        id: doc.id,
        ...doc.data(),
        internshipsCount: internshipsSnapshot.data().count,
      };
    } catch (error) {
      console.error('Error fetching company:', error);
      throw new Error('Failed to fetch company');
    }
  }

  async create(createCompanyDto: any) {
    try {
      const firestore = this.firebaseService.firestore;

      const companyId = createCompanyDto.email.replace(/[@.]/g, '_');
      const companyData = {
        name: createCompanyDto.name,
        email: createCompanyDto.email,
        industry: createCompanyDto.industry || '',
        location: createCompanyDto.location || '',
        description: createCompanyDto.description || '',
        logoUrl: createCompanyDto.logoUrl || '',
        status: createCompanyDto.status || 'active',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await firestore.collection('companies').doc(companyId).set(companyData);

      return {
        id: companyId,
        ...companyData,
      };
    } catch (error) {
      console.error('Error creating company:', error);
      throw new Error('Failed to create company');
    }
  }

  async update(id: string, updateCompanyDto: any) {
    try {
      const firestore = this.firebaseService.firestore;
      const docRef = firestore.collection('companies').doc(id);
      
      const doc = await docRef.get();
      if (!doc.exists) {
        throw new Error('Company not found');
      }

      const updateData = {
        name: updateCompanyDto.name,
        industry: updateCompanyDto.industry,
        location: updateCompanyDto.location,
        description: updateCompanyDto.description,
        logoUrl: updateCompanyDto.logoUrl,
        status: updateCompanyDto.status,
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
      console.error('Error updating company:', error);
      throw new Error('Failed to update company');
    }
  }

  async remove(id: string) {
    try {
      const firestore = this.firebaseService.firestore;
      const docRef = firestore.collection('companies').doc(id);
      
      const doc = await docRef.get();
      if (!doc.exists) {
        throw new Error('Company not found');
      }

      await docRef.delete();

      return { message: 'Company deleted successfully' };
    } catch (error) {
      console.error('Error deleting company:', error);
      throw new Error('Failed to delete company');
    }
  }
}

