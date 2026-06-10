/**
 * LumeAuto Mobile — Firebase Client SDK
 * Shared auth via DarkWave Auth Firebase project.
 *
 * DarkWave Studios LLC — Copyright 2026
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithCredential,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
  type User,
  type Auth,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { IS_COX } from './variant';

// ── DarkWave Auth — same project as Trust Hub / web app ──
const firebaseConfig = {
  apiKey: "AIzaSyBYS5O_sFKrbZdC_5LU8cFDJ_E55kz6V4s",
  authDomain: "darkwave-auth.firebaseapp.com",
  projectId: "darkwave-auth",
  storageBucket: "darkwave-auth.firebasestorage.app",
  messagingSenderId: "41307406912",
  appId: "1:41307406912:android:76c6b8f59764c9122a55a5",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let auth: Auth = getAuth(app);

// ── Domain Whitelist (shared with web) ──
const ALLOWED_DOMAINS = ['coxautoinc.com'];
const ALLOWED_EMAILS = [
  'kathytidwell74@gmail.com',
  'rtaron@bellsouth.net',
  'cryptocreeper94@gmail.com',
  'averymackenna@gmail.com',
  'barrycline33@gmail.com',
  'ronald.andrews@coxautoinc.com',
];

function validateEmailDomain(email: string | null): void {
  if (!email) throw new Error('No email address found on this account.');
  // Consumer builds: open registration — anyone can sign up
  if (!IS_COX) return;
  // Cox builds: restrict to authorized domains/emails only
  const lower = email.trim().toLowerCase();
  const domain = lower.split('@')[1];
  if (ALLOWED_EMAILS.includes(lower)) return;
  if (!domain || !ALLOWED_DOMAINS.includes(domain)) {
    throw new Error('Access restricted to authorized Cox email addresses.');
  }
}

// ── Auth Helpers ──

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const cleanEmail = email.trim();
  validateEmailDomain(cleanEmail);
  const result = await signInWithEmailAndPassword(auth, cleanEmail, password);
  return result.user;
}

export async function registerWithEmail(email: string, password: string, displayName?: string): Promise<User> {
  const cleanEmail = email.trim();
  validateEmailDomain(cleanEmail);
  const result = await createUserWithEmailAndPassword(auth, cleanEmail, password);
  if (displayName) {
    await updateProfile(result.user, { displayName });
  }
  return result.user;
}

export async function signInWithGoogleCredential(idToken: string): Promise<User> {
  const credential = GoogleAuthProvider.credential(idToken);
  const result = await signInWithCredential(auth, credential);
  validateEmailDomain(result.user.email);
  return result.user;
}

export async function firebaseSignOut(): Promise<void> {
  await signOut(auth);
}

export { app, auth, onAuthStateChanged, type User };
