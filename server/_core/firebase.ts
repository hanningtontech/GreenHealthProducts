import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { ENV } from "./env";

export function getFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) return getApp();
  if (!ENV.firebaseApiKey || !ENV.firebaseProjectId || !ENV.firebaseAppId) {
    throw new Error("Firebase is not configured. Set FIREBASE_* in .env");
  }
  return initializeApp({
    apiKey: ENV.firebaseApiKey,
    authDomain: ENV.firebaseAuthDomain,
    projectId: ENV.firebaseProjectId,
    storageBucket: ENV.firebaseStorageBucket,
    messagingSenderId: ENV.firebaseMessagingSenderId,
    appId: ENV.firebaseAppId,
    measurementId: ENV.firebaseMeasurementId || undefined,
  });
}

export function isFirebaseConfigured(): boolean {
  return Boolean(ENV.firebaseApiKey && ENV.firebaseProjectId && ENV.firebaseAppId);
}
