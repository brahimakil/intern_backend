import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseAuthGuard extends AuthGuard('firebase') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization?.split('Bearer ')[1];

    if (!token) {
      return false;
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      request.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        role: 'admin',
      };
      return true;
    } catch (error) {
      console.error('Firebase auth error:', error.message);
      return false;
    }
  }
}
