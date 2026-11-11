import type { FirebaseOptions } from 'firebase/app';

/**
 * The Firebase project this build keeps its records in, from the VITE_FIREBASE_* variables set when it was built
 * (`.env.local`, or the repository's Actions variables for release builds). Null without one: the build then keeps
 * its records on this computer only, as before (docs/adr/0009). These values name the project; they are not secrets.
 * Who may read the records is decided by signing in and by firestore.rules.
 */
export function firebaseConfig(env: Record<string, string | boolean | undefined>): FirebaseOptions | null {
  const text = (key: string) => String(env[key] ?? '').trim() || null;
  const apiKey = text('VITE_FIREBASE_API_KEY');
  const projectId = text('VITE_FIREBASE_PROJECT_ID');
  const appId = text('VITE_FIREBASE_APP_ID');

  if (!apiKey || !projectId || !appId) return null;

  return { apiKey, projectId, appId, authDomain: text('VITE_FIREBASE_AUTH_DOMAIN') ?? `${projectId}.firebaseapp.com` };
}
