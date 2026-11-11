import { COLLECTIONS, jsonText, type DocumentChanges, type JsonValue, type StateDocument } from '@keystone/core';
import { FirebaseError, initializeApp, type FirebaseOptions } from 'firebase/app';
import { browserLocalPersistence, indexedDBLocalPersistence, initializeAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  collection, doc, getDoc, getDocs, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, runTransaction,
  serverTimestamp, setDoc, writeBatch, type WriteBatch,
} from 'firebase/firestore';
import type { RemoteDocs } from './cloud';

// The company's records in Firestore, behind the RemoteDocs interface (docs/adr/0009). Loaded only when the build
// has a Firebase project (VITE_FIREBASE_*), so the SDK never reaches a build without one.
//
//   keystone/apg                  { status: 'moving' | 'ready', by, at }: whether the records have been moved in
//   keystone/apg/members/{uid}    { role: 'owner' | 'staff', name }: who may open them (firestore.rules)
//   keystone/apg/{dir|cv|bs|ids|log|ext}/{id}   { pos, body }: one record each (StateDocument)

const COMPANY = 'apg';

/** Firestore takes at most 500 writes in one batch. */
const BATCH = 500;

export interface CloudSession {
  remote: RemoteDocs;
  /** True when someone is already signed in on this computer. */
  signedIn(): Promise<boolean>;
  /** Signs in, or throws the sentence to show. */
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** A cloud failure as a sentence for the person. */
  explain(cause: unknown): string;
}

export function explainCloudError(cause: unknown): string {
  const code = cause instanceof FirebaseError ? cause.code : '';

  // Firebase spells this one as a sentence ("auth/api-key-not-valid.-please-pass-a-valid-api-key.").
  if (code.startsWith('auth/api-key') || code === 'auth/invalid-api-key') {
    return 'This build of Keystone names a Firebase project it cannot use (VITE_FIREBASE_API_KEY). Ask IT for a corrected build.';
  }

  switch (code) {
    case 'permission-denied':
      return 'This account may not open APG\'s records. Ask the owner to add it in the Firebase console (keystone/apg/members).';
    case 'unavailable':
      return 'Keystone could not reach the cloud, and this computer has no copy of the records yet. Check the internet connection, then try again.';
    case 'auth/invalid-credential':
    case 'auth/invalid-email':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'That email and password do not match an account.';
    case 'auth/user-disabled':
      return 'This account has been turned off. Ask the owner.';
    case 'auth/too-many-requests':
      return 'Too many tries. Wait a few minutes, then try again.';
    case 'auth/network-request-failed':
      return 'Keystone could not reach the sign-in service. Check the internet connection, then try again.';
    default:
      return cause instanceof Error ? cause.message : String(cause);
  }
}

export function openFirebase(options: FirebaseOptions): CloudSession {
  const app = initializeApp(options);
  // Signed in until signing out, on this computer only. No popup or redirect sign-in, so no Google frames.
  const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  // A copy of the records on this computer: Keystone opens and saves offline, and catches up when back online.
  const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  const company = doc(db, 'keystone', COMPANY);
  const me = () => auth.currentUser?.uid ?? null;

  /** Hands every write to Firestore now, in batches, and resolves when the cloud has them all. */
  function commit(ops: ((b: WriteBatch) => void)[]): Promise<void> {
    const batches: Promise<void>[] = [];

    for (let i = 0; i < ops.length; i += BATCH) {
      const batch = writeBatch(db);

      for (const op of ops.slice(i, i + BATCH)) op(batch);
      batches.push(batch.commit());
    }

    return Promise.all(batches).then(() => {});
  }

  const put = (d: StateDocument) => (b: WriteBatch) => { b.set(doc(company, d.collection, d.id), { pos: d.pos, body: d.body }); };

  const remote: RemoteDocs = {
    async readAll() {
      const marker = await getDoc(company);

      if (marker.get('status') !== 'ready') return null;

      const lists = await Promise.all(COLLECTIONS.map(async (c) => (await getDocs(collection(company, c))).docs.map((d): StateDocument => {
        const pos: JsonValue = d.get('pos') ?? null;
        const body: JsonValue = d.get('body') ?? null;

        // A field edited by hand into something else reads as nothing; fromDocuments then leaves that record out.
        return { collection: c, id: d.id, pos: Number.isInteger(pos) ? Number(pos) : 0, body: jsonText(body) };
      })));

      return lists.flat();
    },

    async moveIn(docs) {
      const by = me();

      // Only one computer moves its records in. One that stopped halfway may finish its own move.
      const claimed = await runTransaction(db, async (t) => {
        const marker = await t.get(company);

        if (marker.exists() && !(marker.get('status') === 'moving' && marker.get('by') === by)) return false;
        t.set(company, { status: 'moving', by, at: serverTimestamp() });

        return true;
      });

      if (!claimed) return false;
      await commit(docs.map(put));
      await setDoc(company, { status: 'ready', by, at: serverTimestamp() });

      return true;
    },

    write(change: DocumentChanges) {
      return commit([
        ...change.set.map(put),
        ...change.remove.map((r) => (b: WriteBatch) => { b.delete(doc(company, r.collection, r.id)); }),
      ]);
    },
  };

  return {
    remote,
    signedIn: async () => {
      await auth.authStateReady();

      return auth.currentUser !== null;
    },
    signIn: async (email, password) => {
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (e) {
        throw new Error(explainCloudError(e));
      }
    },
    signOut: () => signOut(auth),
    explain: explainCloudError,
  };
}
