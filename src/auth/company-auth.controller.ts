import { Controller, Post, Body, HttpException, HttpStatus, Get, UseGuards, Req, Patch, Param } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import * as admin from 'firebase-admin';
import { FirebaseAuthGuard } from './firebase-auth.guard';

@Controller('auth/company')
export class CompanyAuthController {
  constructor(private firebaseService: FirebaseService) {}

  @Post('register')
  async register(@Body() registerDto: any) {
    try {
      const { email, password, name, industry, location, description, logoUrl } = registerDto;

      if (!email || !password || !name) {
        throw new HttpException('Email, password, and company name are required', HttpStatus.BAD_REQUEST);
      }

      const firestore = this.firebaseService.firestore;
      const companyId = email.replace(/[@.]/g, '_');

      // Check if company already exists
      const existingCompany = await firestore.collection('companies').doc(companyId).get();
      if (existingCompany.exists) {
        throw new HttpException('Company with this email already exists', HttpStatus.CONFLICT);
      }

      // Create Firebase Auth user
      let userRecord;
      try {
        userRecord = await admin.auth().createUser({
          email,
          password,
          emailVerified: false,
        });
      } catch (authError: any) {
        if (authError.code === 'auth/email-already-exists') {
          throw new HttpException('Email already in use', HttpStatus.CONFLICT);
        }
        throw authError;
      }

      // Save company to Firestore with INACTIVE status
      const companyData = {
        name,
        email,
        industry: industry || '',
        location: location || '',
        description: description || '',
        logoUrl: logoUrl || '',
        status: 'inactive', // Companies start as inactive until admin approves
        uid: userRecord.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await firestore.collection('companies').doc(companyId).set(companyData);

      return {
        success: true,
        message: 'Company registered successfully. Awaiting admin approval.',
        companyId,
        status: 'inactive',
      };
    } catch (error: any) {
      console.error('Error registering company:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to register company', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('login')
  async login(@Body() loginDto: any) {
    try {
      const { idToken } = loginDto;

      if (!idToken) {
        throw new HttpException('ID token is required', HttpStatus.BAD_REQUEST);
      }

      // Verify Firebase token
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const { email, uid } = decodedToken;

      if (!email) {
        throw new HttpException('Invalid token', HttpStatus.UNAUTHORIZED);
      }

      const firestore = this.firebaseService.firestore;
      const companyId = email.replace(/[@.]/g, '_');

      // Check if company exists in companies collection
      const companyDoc = await firestore.collection('companies').doc(companyId).get();
      
      if (!companyDoc.exists) {
        throw new HttpException('Company not found. Please contact administrator.', HttpStatus.NOT_FOUND);
      }

      const companyData = companyDoc.data();

      return {
        success: true,
        company: {
          id: companyDoc.id,
          name: companyData?.name,
          email: companyData?.email,
          status: companyData?.status,
          industry: companyData?.industry,
          location: companyData?.location,
          description: companyData?.description,
          logoUrl: companyData?.logoUrl,
          uid: companyData?.uid,
        },
      };
    } catch (error: any) {
      console.error('Error logging in company:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to login', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('profile')
  @UseGuards(FirebaseAuthGuard)
  async getProfile(@Req() req: any) {
    try {
      const { email } = req.user;
      
      const firestore = this.firebaseService.firestore;
      const companyId = email.replace(/[@.]/g, '_');

      const companyDoc = await firestore.collection('companies').doc(companyId).get();
      
      if (!companyDoc.exists) {
        throw new HttpException('Company not found', HttpStatus.NOT_FOUND);
      }

      const companyData = companyDoc.data();

      return {
        id: companyDoc.id,
        name: companyData?.name,
        email: companyData?.email,
        status: companyData?.status,
        industry: companyData?.industry,
        location: companyData?.location,
        description: companyData?.description,
        logoUrl: companyData?.logoUrl,
      };
    } catch (error: any) {
      console.error('Error fetching company profile:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to fetch profile', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch('update-logo/:id')
  @UseGuards(FirebaseAuthGuard)
  async updateLogo(@Param('id') id: string, @Body() body: { logoUrl: string }) {
    try {
      const firestore = this.firebaseService.firestore;
      const docRef = firestore.collection('companies').doc(id);
      
      const doc = await docRef.get();
      if (!doc.exists) {
        throw new HttpException('Company not found', HttpStatus.NOT_FOUND);
      }

      await docRef.update({
        logoUrl: body.logoUrl,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        message: 'Logo updated successfully',
        logoUrl: body.logoUrl,
      };
    } catch (error: any) {
      console.error('Error updating company logo:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to update company logo', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
