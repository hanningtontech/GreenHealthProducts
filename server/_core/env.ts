// Platform values are read at use time. See the Webdev service/authentication skills.
export const ENV = {
  get appId() { return process.env.MANUS_PROJECT_ID ?? ""; },
  get cookieSecret() { return process.env.MANUS_JWT_SECRET ?? ""; },
  get databaseUrl() { return process.env.DATABASE_URL ?? ""; },
  get oAuthServerUrl() { return process.env.MANUS_OAUTH_API_URL ?? ""; },
  // Preserve the legacy hint when supplied; otherwise roles remain application data.
  get ownerOpenId() { return process.env.OWNER_OPEN_ID ?? ""; },
  get isProduction() { return process.env.NODE_ENV === "production"; },
  get forgeApiUrl() { return process.env.MANUS_API_URL ?? ""; },
  get forgeApiKey() { return process.env.MANUS_API_KEY ?? ""; },
  get firebaseApiKey() { return process.env.FIREBASE_API_KEY ?? ""; },
  get firebaseAuthDomain() { return process.env.FIREBASE_AUTH_DOMAIN ?? ""; },
  get firebaseProjectId() { return process.env.FIREBASE_PROJECT_ID ?? ""; },
  get firebaseStorageBucket() { return process.env.FIREBASE_STORAGE_BUCKET ?? ""; },
  get firebaseMessagingSenderId() { return process.env.FIREBASE_MESSAGING_SENDER_ID ?? ""; },
  get firebaseAppId() { return process.env.FIREBASE_APP_ID ?? ""; },
  get firebaseMeasurementId() { return process.env.FIREBASE_MEASUREMENT_ID ?? ""; },
  get firebaseProjectNumber() { return process.env.FIREBASE_PROJECT_NUMBER ?? ""; },
  /** Backblaze B2 (S3-compatible) */
  get b2KeyId() { return process.env.B2_KEY_ID ?? ""; },
  get b2ApplicationKey() { return process.env.B2_APPLICATION_KEY ?? ""; },
  get b2Bucket() { return process.env.B2_BUCKET ?? ""; },
  get b2Endpoint() { return process.env.B2_ENDPOINT ?? ""; },
  get b2Region() { return process.env.B2_REGION ?? "us-west-004"; },
  get b2PublicBaseUrl() { return process.env.B2_PUBLIC_BASE_URL ?? ""; },
};
