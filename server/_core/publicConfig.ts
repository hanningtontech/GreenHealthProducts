// Only these public values may reach the browser. Never serialize process.env.
export function publicPlatformConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    projectId: env.MANUS_PROJECT_ID ?? "",
    oauthPortalUrl: env.MANUS_OAUTH_PORTAL_URL ?? "",
    apiUrl: env.MANUS_API_URL ?? "",
    apiBrowserKey: env.MANUS_API_BROWSER_KEY ?? "",
    // Firebase web config is designed to be public (rules/App Check protect data).
    firebase: {
      apiKey: env.FIREBASE_API_KEY ?? "",
      authDomain: env.FIREBASE_AUTH_DOMAIN ?? "",
      projectId: env.FIREBASE_PROJECT_ID ?? "",
      storageBucket: env.FIREBASE_STORAGE_BUCKET ?? "",
      messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID ?? "",
      appId: env.FIREBASE_APP_ID ?? "",
      measurementId: env.FIREBASE_MEASUREMENT_ID ?? "",
    },
  };
}

export function publicPlatformScript(env: NodeJS.ProcessEnv = process.env): string {
  const json = JSON.stringify(publicPlatformConfig(env)).replaceAll("<", "\\u003c");
  return `window.__MANUS_CONFIG__=${json};`;
}
