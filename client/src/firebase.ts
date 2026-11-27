import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable } from 'firebase/storage';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Object.values(config).every(Boolean);

function getFirebaseApp() {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase n’est pas encore configuré pour ce site.');
  }
  return getApps().length ? getApp() : initializeApp(config);
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}

export { onAuthStateChanged };

/**
 * Signs in with e-mail and password. With `remember`, the session survives closing the
 * browser; without it, it ends with the browser session.
 */
export async function signInAdmin(email: string, password: string, remember = true): Promise<User> {
  const auth = getFirebaseAuth();
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  const credentials = await signInWithEmailAndPassword(auth, email, password);
  return credentials.user;
}

/** Sends Firebase's password reset e-mail. */
export async function sendPasswordReset(email: string) {
  const auth = getFirebaseAuth();
  auth.languageCode = 'fr';
  await sendPasswordResetEmail(auth, email);
}

/** Where the link in the verification e-mail brings the customer back. */
const verificationSettings = () => ({ url: `${window.location.origin}/admin?verified=1` });

/** Sends (again) the e-mail whose link confirms the address of the signed-in account. */
export async function resendEmailVerification() {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error('Connectez-vous pour vérifier votre adresse e-mail.');
  auth.languageCode = 'fr';
  await sendEmailVerification(user, verificationSettings());
}

/**
 * Reads the account again from Firebase (the link was opened in another tab or on another
 * device) and renews the session token so the API sees the new state.
 */
export async function refreshEmailVerified(): Promise<boolean> {
  const user = getFirebaseAuth().currentUser;
  if (!user || user.isAnonymous) return false;
  await user.reload();
  if (user.emailVerified) await user.getIdToken(true);
  return user.emailVerified;
}

export async function signOutAdmin() {
  await signOut(getFirebaseAuth());
}

export async function uploadQuoteFile(
  file: File,
  uid: string,
  onProgress: (progress: number) => void,
): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !['stl', 'obj'].includes(extension)) {
    throw new Error('Choisis un fichier STL ou OBJ.');
  }
  if (file.size === 0 || file.size > 50 * 1024 * 1024) {
    throw new Error('Le fichier doit peser entre 1 octet et 50 Mo.');
  }

  const storage = getStorage(getFirebaseApp());
  const path = `quotes/${uid}/${crypto.randomUUID()}.${extension}`;
  const task = uploadBytesResumable(ref(storage, path), file, {
    contentType: 'application/octet-stream',
  });

  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
      reject,
      () => resolve(task.snapshot.ref.fullPath),
    );
  });
}

export async function getUploadUser(): Promise<User> {
  const auth = getFirebaseAuth();
  return auth.currentUser ?? (await signInAnonymously(auth)).user;
}

export async function getCurrentUserToken(): Promise<string> {
  const user = getFirebaseAuth().currentUser;
  if (!user || user.isAnonymous) {
    throw new Error('Connectez-vous avec un compte pour continuer.');
  }
  return user.getIdToken();
}

export interface RegisterPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  password: string;
}

export async function registerUser(payload: RegisterPayload): Promise<User> {
  const auth = getFirebaseAuth();
  const db = getFirestore(getFirebaseApp());
  const { email, password, firstName, lastName, phone, address, city } = payload;

  const credentials = await createUserWithEmailAndPassword(auth, email, password);
  const { uid } = credentials.user;

  // Set displayName in Firebase Auth
  try {
    const fullName = `${firstName} ${lastName}`.trim();
    if (fullName) {
      await updateProfile(credentials.user, { displayName: fullName });
    }
  } catch (err) {
    console.warn('updateProfile warning:', err);
  }

  const profileData = {
    uid,
    email,
    firstName,
    lastName,
    phone,
    address,
    city,
    country: 'Maroc',
    role: 'Utilisateur',
    createdAt: new Date().toISOString(),
  };

  // 1. Direct write to Firestore collection 'Users' (and 'users' as fallback)
  try {
    await setDoc(doc(db, 'Users', uid), profileData);
  } catch (err) {
    console.warn('Client setDoc Users failed, server will ensure write:', err);
  }
  try {
    await setDoc(doc(db, 'users', uid), profileData);
  } catch {
    // ignore
  }

  // 2. Also save via backend (Admin SDK) to guarantee saving in Firestore 'Users'
  try {
    const apiBase = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '/api' : 'http://localhost:4000/api');
    await fetch(`${apiBase}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profileData),
    });
  } catch (err) {
    console.warn('Backend /api/register call warning:', err);
  }

  // Confirmation e-mail: the owner of the address clicks its link to verify it.
  try {
    auth.languageCode = 'fr';
    await sendEmailVerification(credentials.user, verificationSettings());
  } catch (err) {
    console.warn('sendEmailVerification warning:', err);
  }

  // Sign back out so the registration doesn't auto-login as admin
  await signOut(auth);

  return credentials.user;
}
