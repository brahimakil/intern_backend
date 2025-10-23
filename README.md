# Internship Management Backend (NestJS + Firebase)

Backend API server using NestJS + Firebase (Firestore + Auth + Storage)

## Architecture

- **Authentication**: Firebase Auth (tokens verified by backend)
- **Database**: Firebase Firestore (NoSQL cloud database)
- **Storage**: Firebase Storage (for files/media)
- **APIs**: REST endpoints for dashboard stats, companies, internships, applications

```
Frontend (React)
    ↓ Firebase Auth Token
NestJS Backend (Port 3000)
    ↓ Firebase Admin SDK
Firebase (Firestore + Storage + Auth)
```

## Setup

### 1. Create .env file

Copy `env.txt` to `.env`:

```env
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

### 2. Firebase Configuration

The backend uses the same Firebase project as the frontend:
- Project ID: `internshipsystem-43e2c`
- No additional setup needed for development!

For production, download service account JSON from:
Firebase Console → Project Settings → Service Accounts → Generate New Private Key

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Backend

```bash
npm run start:dev
```

Backend will run on: `http://localhost:3000`

## API Endpoints

### Dashboard
- `GET /dashboard/stats` - Get dashboard statistics from Firestore

All endpoints require Firebase Auth token in `Authorization: Bearer <token>` header

## Firestore Collections

The backend queries these collections:

- `users` - User accounts (role: admin/company/student)
- `companies` - Company profiles (status: active/inactive)
- `internships` - Internship postings (status: open/closed)
- `applications` - Student applications

## How It Works

1. **Frontend** authenticates with Firebase Auth
2. **Frontend** gets Firebase ID token
3. **Frontend** sends API requests with token in header
4. **Backend** verifies token with Firebase Admin SDK
5. **Backend** queries Firestore database
6. **Backend** returns data to frontend

## Firebase Storage

For file uploads (company logos, student resumes, etc.):
- Storage bucket: `internshipsystem-43e2c.firebasestorage.app`
- Access via Firebase Admin SDK

## Development vs Production

**Development** (Current):
- No service account credentials needed
- Firebase Admin SDK works with application default credentials

**Production**:
- Add Firebase service account JSON
- Set `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` in `.env`

## No Database Setup Needed!

Unlike MySQL, Firebase Firestore:
- ✅ No installation required
- ✅ No schema migrations
- ✅ No connection configuration
- ✅ Auto-scales
- ✅ Real-time updates
- ✅ Built-in security rules

Just run and go! 🚀
