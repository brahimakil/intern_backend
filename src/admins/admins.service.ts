import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import * as admin from 'firebase-admin';
import { CreateAdminDto, UpdateAdminDto } from './dto/admin.dto';

@Injectable()
export class AdminsService {
  constructor(private firebaseService: FirebaseService) {}

  async findAll() {
    try {
      const firestore = this.firebaseService.firestore;
      const adminsSnapshot = await firestore
        .collection('users')
        .where('role', '==', 'admin')
        .get();
      
      const admins = adminsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return admins;
    } catch (error) {
      console.error('Error fetching admins:', error);
      throw new Error('Failed to fetch admins');
    }
  }

  async findOne(id: string) {
    try {
      const firestore = this.firebaseService.firestore;
      const docRef = firestore.collection('users').doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        throw new Error('Admin not found');
      }

      return {
        id: doc.id,
        ...doc.data(),
      };
    } catch (error) {
      console.error('Error fetching admin:', error);
      throw new Error('Failed to fetch admin');
    }
  }

  async create(createAdminDto: CreateAdminDto) {
    try {
      const firestore = this.firebaseService.firestore;
      const auth = this.firebaseService.auth;

      // Create user in Firebase Authentication
      const userRecord = await auth.createUser({
        email: createAdminDto.email,
        password: createAdminDto.password || 'TempPass123!',
        emailVerified: false,
      });

      // Set custom claims for role
      await auth.setCustomUserClaims(userRecord.uid, { role: 'admin' });

      // Create admin document in Firestore
      const adminData = {
        email: createAdminDto.email,
        fullName: createAdminDto.fullName,
        status: createAdminDto.status || 'active',
        role: 'admin',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await firestore.collection('users').doc(userRecord.uid).set(adminData);

      return {
        id: userRecord.uid,
        ...adminData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      console.error('Error creating admin:', error);
      throw new Error('Failed to create admin');
    }
  }

  async update(id: string, updateAdminDto: UpdateAdminDto) {
    try {
      const firestore = this.firebaseService.firestore;
      const auth = this.firebaseService.auth;
      const docRef = firestore.collection('users').doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        throw new Error('Admin not found');
      }

      const currentData = doc.data() || {};
      let uid: string | null = id;

      // Resolve UID: Try using id as UID, fallback to email lookup
      try {
        await auth.getUser(uid);
      } catch (error) {
        if (currentData.email) {
          try {
            const userRecord = await auth.getUserByEmail(currentData.email);
            uid = userRecord.uid;
          } catch (innerError) {
            console.warn(`Auth user not found for ${currentData.email}`);
            // If auth user missing but we want to update auth fields, throw error
            if (updateAdminDto.email || updateAdminDto.password) {
              throw new Error('User not found in Authentication system');
            }
            uid = null;
          }
        } else {
           uid = null;
        }
      }

      // Update email in Firebase Authentication if provided
      if (updateAdminDto.email && uid) {
        await auth.updateUser(uid, { email: updateAdminDto.email });
      }

      // Update password if provided
      if (updateAdminDto.password && uid) {
        await auth.updateUser(uid, { password: updateAdminDto.password });
      }

      // Update admin document in Firestore
      const updateData: any = {
        ...updateAdminDto,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Remove password from Firestore document
      delete updateData.password;

      await docRef.update(updateData);

      return {
        id,
        ...doc.data(),
        ...updateData,
        updatedAt: new Date(),
      };
    } catch (error) {
      console.error('Error updating admin:', error);
      throw new Error(error.message || 'Failed to update admin');
    }
  }

  async remove(id: string) {
    try {
      const firestore = this.firebaseService.firestore;
      const auth = this.firebaseService.auth;
      const docRef = firestore.collection('users').doc(id);
      const doc = await docRef.get();

      if (!doc.exists) {
        throw new Error('Admin not found');
      }

      const currentData = doc.data() || {};
      let uid: string | null = id;

      // Resolve UID
      try {
        await auth.getUser(uid);
      } catch (error) {
        if (currentData.email) {
          try {
            const userRecord = await auth.getUserByEmail(currentData.email);
            uid = userRecord.uid;
          } catch (innerError) {
            console.warn(`Auth user not found for ${currentData.email}`);
            uid = null;
          }
        }
      }

      // Delete from Firebase Authentication if uid found
      if (uid) {
        await auth.deleteUser(uid);
      }

      // Delete from Firestore
      await docRef.delete();

      return { id, message: 'Admin deleted successfully' };
    } catch (error) {
      console.error('Error deleting admin:', error);
      throw new Error('Failed to delete admin');
    }
  }
}
