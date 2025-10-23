import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseAuthStrategy extends PassportStrategy(Strategy, 'firebase') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKeyProvider: (request, rawJwtToken, done) => {
        // Firebase handles verification
        done(null, '');
      },
      passReqToCallback: true,
    });

    // Initialize Firebase Admin if not already initialized
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: 'internshipsystem-43e2c',
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
          privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        }),
      });
    }
  }

  async validate(req: any, token: string) {
    try {
      const firebaseToken = req.headers.authorization?.split('Bearer ')[1];
      if (!firebaseToken) {
        throw new UnauthorizedException('No token provided');
      }

      const decodedToken = await admin.auth().verifyIdToken(firebaseToken);
      return {
        uid: decodedToken.uid,
        email: decodedToken.email,
        role: 'admin',
      };
    } catch (error) {
      console.error('Firebase token verification failed:', error);
      throw new UnauthorizedException('Invalid token');
    }
  }
}
