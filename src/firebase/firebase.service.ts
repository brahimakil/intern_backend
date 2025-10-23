import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import * as path from 'path';

@Injectable()
export class FirebaseService {
  private db: admin.firestore.Firestore;
  private storageInstance: admin.storage.Storage;
  private authInstance: admin.auth.Auth;

  constructor() {
    if (admin.apps.length === 0) {
      const serviceAccount = require(path.join(__dirname, '../../internshipsystem-43e2c-firebase-adminsdk-fbsvc-0f898554e7.json'));
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: 'https://internshipsystem-43e2c.firebaseio.com',
        storageBucket: 'internshipsystem-43e2c.firebasestorage.app',
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
