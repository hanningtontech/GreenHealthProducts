import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import type { FirebaseOptions } from "firebase/app";

function readClientConfig(): FirebaseOptions | null {
  const cfg = window.__MANUS_CONFIG__?.firebase;
  if (!cfg?.apiKey || !cfg.projectId || !cfg.appId) return null;
  return {
    apiKey: cfg.apiKey,
    authDomain: cfg.authDomain,
    projectId: cfg.projectId,
    storageBucket: cfg.storageBucket,
    messagingSenderId: cfg.messagingSenderId,
    appId: cfg.appId,
    measurementId: cfg.measurementId || undefined,
  };
}

export function getFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) return getApp();
  const config = readClientConfig();
  if (!config) {
    throw new Error("Firebase is not configured. Check FIREBASE_* in .env and restart the server.");
  }
  return initializeApp(config);
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

export function getDb(): Firestore {
  return getFirestore(getFirebaseApp());
}

export function getFirebaseStorage(): FirebaseStorage {
  return getStorage(getFirebaseApp());
}

let analyticsPromise: Promise<Analytics | null> | null = null;

export function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (!analyticsPromise) {
    analyticsPromise = (async () => {
      if (!(await isSupported())) return null;
      return getAnalytics(getFirebaseApp());
    })().catch(() => null);
  }
  return analyticsPromise;
}

export function isFirebaseConfigured(): boolean {
  return Boolean(window.__MANUS_CONFIG__?.firebase?.apiKey);
}
