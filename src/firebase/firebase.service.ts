import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService {
  private db: admin.firestore.Firestore;
  private storageInstance: admin.storage.Storage;
  private authInstance: admin.auth.Auth;

  constructor(private configService: ConfigService) {
    if (admin.apps.length === 0) {
      const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
      const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
      const storageBucket = this.configService.get<string>('FIREBASE_STORAGE_BUCKET');

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        storageBucket,
      });
    }

    this.db = admin.firestore();
    this.storageInstance = admin.storage();
    this.authInstance = admin.auth();
  }

  // Getter properties for direct access
  get firestore(): admin.firestore.Firestore {
    return this.db;
  }

  get storage(): admin.storage.Storage {
    return this.storageInstance;
  }

  get auth(): admin.auth.Auth {
    return this.authInstance;
  }

  // Legacy methods for backward compatibility
  getFirestore(): admin.firestore.Firestore {
    return this.db;
  }

  getStorage(): admin.storage.Storage {
    return this.storageInstance;
  }

  async verifyToken(token: string): Promise<admin.auth.DecodedIdToken> {
    return this.authInstance.verifyIdToken(token);
  }
}