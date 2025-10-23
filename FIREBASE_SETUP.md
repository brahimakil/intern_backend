# Firebase Admin SDK Setup

## Important: Firebase Service Account Credentials

**⚠️ NEVER commit your Firebase service account JSON file to Git!**

The file `internshipsystem-43e2c-firebase-adminsdk-fbsvc-0f898554e7.json` contains sensitive credentials and should be kept secure.

## Setup Instructions

### For Local Development:

1. Place your Firebase service account JSON file in the root of `internship_backend/` directory
2. Make sure the file is named: `internshipsystem-43e2c-firebase-adminsdk-fbsvc-0f898554e7.json`
3. The `.gitignore` file is already configured to exclude this file from Git

### For Production/Deployment:

Instead of including the JSON file, use environment variables:

1. Extract the following values from your JSON file:
   - `project_id`
   - `client_email`
   - `private_key`

2. Set them as environment variables:
   ```bash
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_CLIENT_EMAIL=your-client-email
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

3. Update `src/firebase/firebase.service.ts` to use environment variables instead of the JSON file

### Current File Location:

The code expects the service account file at:
```
internship_backend/internshipsystem-43e2c-firebase-adminsdk-fbsvc-0f898554e7.json
```

## Security Best Practices

1. ✅ Add Firebase credential files to `.gitignore`
2. ✅ Use environment variables in production
3. ✅ Rotate credentials if accidentally exposed
4. ✅ Restrict Firebase service account permissions
5. ✅ Use different service accounts for dev/staging/production

## If Credentials Are Exposed

If you've accidentally committed credentials to Git:

1. **Immediately revoke the service account** in Firebase Console
2. Generate a new service account
3. Update your local file and environment variables
4. Use `git filter-branch` or BFG Repo-Cleaner to remove from Git history
5. Force push to remote (if necessary and safe)

## Getting a New Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to Project Settings → Service Accounts
4. Click "Generate New Private Key"
5. Save the JSON file securely (DO NOT commit to Git!)

