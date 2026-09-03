// Import the functions you need from the SDKs you need
import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { GoogleAuthProvider } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FB_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FB_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FB_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FB_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FB_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FB_MEASUREMENT_ID,
};

// Only initialize Firebase when the operator configured real keys.
// With missing/invalid config, `getAuth()` throws at module scope and crashes
// SSR on every page — instead the app degrades to local/guest mode and the
// login/sync features show a clear "not configured" message.
const hasValidConfig = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId,
);

export const firebaseConfigured = hasValidConfig;

export const app: FirebaseApp | null = hasValidConfig
  ? initializeApp(firebaseConfig)
  : null;
export const auth: Auth | null = hasValidConfig && app ? getAuth(app) : null;
export const db: Firestore | null =
  hasValidConfig && app ? getFirestore(app) : null;
export const provider: GoogleAuthProvider | null =
  hasValidConfig && app ? new GoogleAuthProvider() : null;
