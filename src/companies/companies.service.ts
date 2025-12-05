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

  async getUniqueIndustries() {
    try {
      const firestore = this.firebaseService.firestore;
      const companiesSnapshot = await firestore
        .collection('companies')
        .select('industry')
        .get();

      const industries = new Set<string>();
      for (const doc of companiesSnapshot.docs) {
        const industry = doc.data().industry;
        if (industry && industry.trim() !== '') {
          industries.add(industry.trim());
        }
      }

      return Array.from(industries).sort((a, b) => a.localeCompare(b));
    } catch (error) {
      console.error('Error fetching unique industries:', error);
      throw new Error('Failed to fetch unique industries');
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
      
      console.log('========================================');
      console.log('Creating company with full DTO:', JSON.stringify(createCompanyDto, null, 2));
      console.log('Password received:', createCompanyDto.password ? `YES (${createCompanyDto.password.length} chars)` : 'NO');
      console.log('========================================');
      
      // Create Firebase Auth user for company
      let uid = '';
      if (createCompanyDto.password && createCompanyDto.password.trim() !== '') {
        try {
          console.log(`Attempting to create Firebase Auth user for: ${createCompanyDto.email}`);
          const userRecord = await admin.auth().createUser({
            email: createCompanyDto.email,
            password: createCompanyDto.password,
            emailVerified: false,
          });
          uid = userRecord.uid;
          console.log(`✓ Firebase Auth user created successfully!`);
          console.log(`  - Email: ${createCompanyDto.email}`);
          console.log(`  - UID: ${uid}`);
        } catch (authError: any) {
          console.error('✗ Error creating Firebase auth user:', authError);
          if (authError.code === 'auth/email-already-exists') {
            throw new Error('Email already in use');
          }
          throw new Error(`Failed to create auth user: ${authError.message}`);
        }
      } else {
        console.log('⚠ No password provided or password is empty, skipping Firebase Auth user creation');
      }
      
      const companyData = {
        name: createCompanyDto.name,
        email: createCompanyDto.email,
        industry: createCompanyDto.industry || '',
        location: createCompanyDto.location || '',
        description: createCompanyDto.description || '',
        logoUrl: createCompanyDto.logoUrl || '',
        status: createCompanyDto.status || 'active',
        uid: uid || '',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await firestore.collection('companies').doc(companyId).set(companyData);
      console.log(`✓ Company document created in Firestore: ${companyId}`);

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

      const companyData = doc.data();

      // Update password in Firebase Auth if provided
      if (updateCompanyDto.password && updateCompanyDto.password.trim() !== '') {
        if (companyData?.uid) {
          // Company has Firebase Auth account, update password
          try {
            await admin.auth().updateUser(companyData.uid, {
              password: updateCompanyDto.password,
            });
            console.log(`Password updated for company: ${id} (uid: ${companyData.uid})`);
          } catch (authError: any) {
            console.error('Error updating Firebase auth password:', authError);
            throw new Error('Failed to update password: ' + authError.message);
          }
        } else {
          // Company doesn't have Firebase Auth account yet, create one
          try {
            const userRecord = await admin.auth().createUser({
              email: companyData?.email || updateCompanyDto.email,
              password: updateCompanyDto.password,
              emailVerified: false,
            });
            console.log(`Created Firebase Auth account for company: ${id} (uid: ${userRecord.uid})`);
            // Update the company document with the new uid
            await docRef.update({ uid: userRecord.uid });
          } catch (authError: any) {
            console.error('Error creating Firebase auth user:', authError);
            if (authError.code === 'auth/email-already-exists') {
              throw new Error('Email already in use in Firebase Auth');
            }
            throw new Error('Failed to create auth account: ' + authError.message);
          }
        }
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

  async updateLogo(id: string, logoUrl: string) {
    try {
      const firestore = this.firebaseService.firestore;
      const docRef = firestore.collection('companies').doc(id);
      
      const doc = await docRef.get();
      if (!doc.exists) {
        throw new Error('Company not found');
      }

      await docRef.update({
        logoUrl,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        id,
        ...doc.data(),
        logoUrl,
      };
    } catch (error) {
      console.error('Error updating company logo:', error);
      throw new Error('Failed to update company logo');
    }
  }

  async uploadLogo(id: string, file: any) {
    try {
      const firestore = this.firebaseService.firestore;
      const storage = this.firebaseService.storage;
      
      const docRef = firestore.collection('companies').doc(id);
      const doc = await docRef.get();
      
      if (!doc.exists) {
        throw new Error('Company not found');
      }

      // Delete old logo if it exists
      const oldLogoUrl = doc.data()?.logoUrl;
      if (oldLogoUrl) {
        try {
          const oldFileName = oldLogoUrl.split('/').pop()?.split('?')[0];
          if (oldFileName) {
            const oldFile = storage.bucket().file(`companies/${id}/${oldFileName}`);
            await oldFile.delete();
          }
        } catch (err) {
          console.log('No old logo to delete or error deleting:', err);
        }
      }

      // Upload new logo
      const fileExtension = file.originalname.split('.').pop();
      const fileName = `logo.${fileExtension}`;
      const filePath = `companies/${id}/${fileName}`;
      const bucket = storage.bucket();
      const fileUpload = bucket.file(filePath);

      await fileUpload.save(file.buffer, {
        metadata: {
          contentType: file.mimetype,
        },
      });

      // Make file publicly accessible
      await fileUpload.makePublic();

      // Get public URL
      const logoUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

      // Update Firestore with new logo URL
      await docRef.update({
        logoUrl,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        id,
        ...doc.data(),
        logoUrl,
      };
    } catch (error) {
      console.error('Error uploading company logo:', error);
      throw new Error('Failed to upload company logo');
    }
  }
}

