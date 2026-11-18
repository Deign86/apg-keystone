import {
  COLLECTIONS, isOwner, jsonText, NOT_YOUR_OWN_ACCOUNT, ONLY_OWNER_MAKES, MEMBER_FIELD, ONLY_OWNER_REMOVES, onlyOwnerGrants, sentenceOf,
  type Accounts, type DocumentChanges, type DocumentLayout, type JsonObject, type JsonValue, type Member, type MemberAccount, type MemberGrant,
  type StateDocument,
} from '@keystone/core';
import { deleteApp, FirebaseError, initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  browserLocalPersistence, connectAuthEmulator, createUserWithEmailAndPassword, deleteUser, EmailAuthProvider, indexedDBLocalPersistence,
  initializeAuth, inMemoryPersistence, reauthenticateWithCredential, sendPasswordResetEmail, signInWithEmailAndPassword, signOut,
  updatePassword, type Auth,
} from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  query, serverTimestamp, setDoc, updateDoc, where, writeBatch, type WriteBatch,
} from 'firebase/firestore';
import type { RemoteDocs } from './cloud';
import type { FirebaseEmulators } from './config';
import { grantsHeld, grantToWrite } from './grants';

// The company's records in Firestore, behind the RemoteDocs interface (docs/adr/0009). Loaded only when the build
// has a Firebase project (VITE_FIREBASE_*), so the SDK never reaches a build without one.
//
//   keystone/apg                  { status: 'ready', by, at }: the records have been started, by an owner (docs/adr/0018)
//   keystone/apg/members/{uid}    { role: 'owner' | 'staff', name, email, …a yes-or-no field per grant }: who may open
//                                 them (firestore.rules), and what a connected system lets the CEO give them (docs/adr/0030)
//   keystone/apg/{dir|cv|bs|ids|log|ext}/{id}   { pos, body }: one record each (StateDocument)
//   keystone/apg/company/details  { pos, body }: the company's details, which only an owner writes (docs/adr/0018)
//   keystone/apg/{a module's own}/{id}          { pos, body, ...its checked fields }: one record each (docs/adr/0011)

const COMPANY = 'apg';

/** Firestore takes at most 500 writes in one batch. */
const BATCH = 500;

const NOT_A_MEMBER = 'This account may not open APG\'s records. Ask the CEO to add it in the Firebase console (keystone/apg/members).';
const WRONG_CURRENT = 'That is not your current password.';
const ENTER_EMAIL = 'Enter the email you sign in with, like ana.cruz@alphapremiergroup.com.';

export interface CloudSession {
  remote: RemoteDocs;
  /** True when someone is already signed in on this computer. */
  signedIn(): Promise<boolean>;
  /** Signs in, or throws the sentence to show. */
  signIn(email: string, password: string): Promise<void>;
  /**
   * Asks Firebase to email a link for choosing a new password (docs/adr/0016). Answers the same whether or not the email
   * has an account, so nobody can use it to learn who does. Throws the sentence to show for an email it cannot send to.
   */
  sendPasswordReset(email: string): Promise<void>;
  signOut(): Promise<void>;
  /** Who is signed in, from their member document. Throws when the account is not a member. */
  member(): Promise<Member>;
  /**
   * Who may open the records, the CEO making and removing accounts, and changing your password (docs/adr/0014–0016),
   * for the member `member()` answered: what they may do is decided from who they are, not from the order of calls.
   */
  accounts(who: Member): Accounts;
  /** A cloud failure as a sentence for the person. */
  explain(cause: unknown): string;
}

function explainCloudError(cause: unknown): string {
  const code = cause instanceof FirebaseError ? cause.code : '';

  // Firebase spells this one as a sentence ("auth/api-key-not-valid.-please-pass-a-valid-api-key.").
  if (code.startsWith('auth/api-key') || code === 'auth/invalid-api-key') {
    return 'This build of Keystone names a Firebase project it cannot use (VITE_FIREBASE_API_KEY). Ask IT for a corrected build.';
  }

  switch (code) {
    case 'permission-denied':
      return NOT_A_MEMBER;
    case 'unavailable':
      return 'Keystone could not reach the cloud, and this computer has no copy of the records yet. Check the internet connection, then try again.';
    case 'auth/invalid-credential':
    case 'auth/invalid-email':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'That email and password do not match an account.';
    case 'auth/user-disabled':
      return 'This account has been turned off. Ask the CEO.';
    case 'auth/too-many-requests':
      return 'Too many tries. Wait a few minutes, then try again.';
    case 'auth/network-request-failed':
      return 'Keystone could not reach the sign-in service. Check the internet connection, then try again.';
    case 'auth/email-already-in-use':
      return 'That email already has a sign-in. If it cannot open the records yet, add it under keystone/apg/members in the Firebase console (docs/FIREBASE.md).';
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return 'The sign-in service refused that password as too weak. Choose a longer one.';
    case 'auth/admin-restricted-operation':
      return 'The Firebase project does not let Keystone make accounts. Ask IT to allow email sign-up (docs/FIREBASE.md).';
    default:
      return sentenceOf(cause);
  }
}

/**
 * The emulators, when given (config.ts › firebaseEmulators), stand in for Google's servers: the end-to-end tests'.
 * `layout` names the lists modules keep as documents of their own, so they are read and written too. `grants` are what
 * the installed connected systems let the CEO give a member (Connector.memberGrant): the only fields beside a member's
 * own that are read from and written to a member document.
 */
export function openFirebase(
  options: FirebaseOptions, emulators: FirebaseEmulators | null = null, layout: DocumentLayout = {}, grants: readonly MemberGrant[] = [],
): CloudSession {
  const app = initializeApp(options);
  // Signed in until signing out, on this computer only. No popup or redirect sign-in, so no Google frames.
  const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  // A copy of the records on this computer: Keystone opens and saves offline, and catches up when back online.
  const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

  if (emulators) {
    const [host, port] = emulators.firestore.split(':');

    connectAuthEmulator(auth, `http://${emulators.auth}`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, Number(port));
  }

  const company = doc(db, 'keystone', COMPANY);
  const members = collection(company, 'members');
  const me = () => auth.currentUser?.uid ?? null;
  // Whether the member signed in is an owner, once member() has read it. Until then, reads are a member's.
  let owner = false;

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

  const put = (d: StateDocument) => (b: WriteBatch) => { b.set(doc(company, d.collection, d.id), { ...d.fields, pos: d.pos, body: d.body }); };

  /**
   * The documents of one collection. A module's own list that only some may read (RecordDocuments.readBy) is asked for
   * as firestore.rules allows: all of it by an owner, only their own by anyone else.
   */
  async function read(c: string): Promise<StateDocument[]> {
    const own = Object.values(layout).find((l) => l.collection === c);
    const uid = me();
    const list = collection(company, c);
    const found = await getDocs(own?.readBy && !owner && uid ? query(list, where(own.readBy, '==', uid)) : list);

    return found.docs.map((d): StateDocument => {
      const pos: JsonValue = d.get('pos') ?? null;
      const body: JsonValue = d.get('body') ?? null;
      // A field edited by hand into something else reads as nothing; fromDocuments then leaves that record out.
      const record: StateDocument = { collection: c, id: d.id, pos: Number.isInteger(pos) ? Number(pos) : 0, body: jsonText(body) };

      if (own) {
        const fields: JsonObject = {};

        for (const f of own.fields) {
          const v: JsonValue | undefined = d.get(f);

          if (v !== undefined) fields[f] = v;
        }

        record.fields = fields;
      }

      return record;
    });
  }

  const remote: RemoteDocs = {
    async readAll() {
      const marker = await getDoc(company);

      if (marker.get('status') !== 'ready') return null;

      const lists = await Promise.all([...COLLECTIONS, ...Object.values(layout).map((l) => l.collection)].map(read));

      return lists.flat();
    },

    // Started with nothing in it; firestore.rules let only an owner do this (docs/adr/0018).
    async start() {
      await setDoc(company, { status: 'ready', by: me(), at: serverTimestamp() });
    },

    write(change: DocumentChanges) {
      return commit([
        ...change.set.map(put),
        ...change.remove.map((r) => (b: WriteBatch) => { b.delete(doc(company, r.collection, r.id)); }),
      ]);
    },
  };

  /**
   * A sign-in of its own, kept in memory, for making someone else's account: creating one signs it in, and doing that
   * here leaves the CEO signed in on this computer. Each gets its own name, so two at once never share one.
   */
  let helpers = 0;

  async function withHelper<T>(work: (helper: Auth) => Promise<T>): Promise<T> {
    const helperApp = initializeApp(options, `keystone-new-account-${++helpers}`);
    const helper = initializeAuth(helperApp, { persistence: inMemoryPersistence });

    if (emulators) connectAuthEmulator(helper, `http://${emulators.auth}`, { disableWarnings: true });

    try {
      return await work(helper);
    } finally {
      await deleteApp(helperApp);
    }
  }

  const accounts = (who: Member): Accounts => ({
    async list() {
      try {
        const found = await getDocs(members);

        return found.docs.map((d): MemberAccount => {
          const email = jsonText(d.get(MEMBER_FIELD.email));

          return {
            uid: d.id, name: jsonText(d.get(MEMBER_FIELD.name)) || email || 'A member', role: d.get(MEMBER_FIELD.role) === 'owner' ? 'owner' : 'staff', email,
            grants: grantsHeld(grants, (field) => d.get(field) === true),
          };
        });
      } catch (e) {
        throw new Error(explainCloudError(e));
      }
    },

    async create({ name, email, password }) {
      // firestore.rules hold the same line: only an owner writes a member.
      if (!isOwner(who)) throw new Error(ONLY_OWNER_MAKES);

      try {
        return await withHelper(async (helper) => {
          const { user } = await createUserWithEmailAndPassword(helper, email, password);
          const made: MemberAccount = { uid: user.uid, name, role: 'staff', email };

          try {
            await setDoc(doc(members, user.uid), { [MEMBER_FIELD.role]: made.role, [MEMBER_FIELD.name]: name, [MEMBER_FIELD.email]: email });
          } catch (e) {
            // A sign-in that is not a member opens nothing; take it back, so the email can be used again.
            await deleteUser(user).catch(() => {});
            throw e instanceof FirebaseError && e.code === 'permission-denied' ? new Error(ONLY_OWNER_MAKES) : e;
          }

          return made;
        });
      } catch (e) {
        throw new Error(explainCloudError(e));
      }
    },

    async remove(uid) {
      // firestore.rules refuse anyone but an owner too. An owner removing themselves would be locked out, so never that.
      if (!isOwner(who)) throw new Error(ONLY_OWNER_REMOVES);

      if (uid === me()) throw new Error(NOT_YOUR_OWN_ACCOUNT);

      try {
        await deleteDoc(doc(members, uid));
      } catch (e) {
        throw new Error(e instanceof FirebaseError && e.code === 'permission-denied' ? ONLY_OWNER_REMOVES : explainCloudError(e));
      }
    },

    async changePassword(current, next) {
      const user = auth.currentUser;

      if (!user?.email) throw new Error('Sign out and in again, then change your password.');

      // Firebase changes a password only for a sign-in made just now, so the current password signs in again first.
      try {
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
      } catch (e) {
        const code = e instanceof FirebaseError ? e.code : '';

        throw new Error(code === 'auth/invalid-credential' || code === 'auth/wrong-password' ? WRONG_CURRENT : explainCloudError(e));
      }

      try {
        await updatePassword(user, next);
      } catch (e) {
        throw new Error(explainCloudError(e));
      }
    },

    // firestore.rules let a member change their own name, and nothing else of their member document (docs/adr/0020).
    async rename(name) {
      const uid = me();

      if (!uid) throw new Error('Sign out and in again, then change your name.');

      try {
        await updateDoc(doc(members, uid), { [MEMBER_FIELD.name]: name });
      } catch (e) {
        throw new Error(explainCloudError(e));
      }
    },

    // firestore.rules hold the same line: only an owner writes another member's document, and a member changes only
    // their own name, so nobody gives themselves this. Only a field a connector contributed is ever written: never
    // `role`, and nothing a part made up.
    async setGrant(uid, field, on) {
      const grant = grantToWrite(grants, field, who);

      try {
        await updateDoc(doc(members, uid), { [grant.field]: on });
      } catch (e) {
        throw new Error(e instanceof FirebaseError && e.code === 'permission-denied' ? onlyOwnerGrants(grant) : explainCloudError(e));
      }
    },
  });

  return {
    remote,
    accounts,
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
    sendPasswordReset: async (email) => {
      try {
        await sendPasswordResetEmail(auth, email);
      } catch (e) {
        const code = e instanceof FirebaseError ? e.code : '';

        // A project without email enumeration protection says so for an unknown email; answer as for a known one.
        if (code === 'auth/user-not-found') return;

        throw new Error(code === 'auth/invalid-email' || code === 'auth/missing-email' ? ENTER_EMAIL : explainCloudError(e));
      }
    },
    signOut: () => signOut(auth),
    member: async () => {
      const uid = me();
      const found = uid ? await getDoc(doc(members, uid)) : null;

      if (!uid || !found?.exists()) throw new Error(NOT_A_MEMBER);
      const who: Member = { uid, name: jsonText(found.get(MEMBER_FIELD.name)) || auth.currentUser?.email || 'A member', role: found.get(MEMBER_FIELD.role) === 'owner' ? 'owner' : 'staff' };

      owner = isOwner(who);

      return who;
    },
    explain: explainCloudError,
  };
}
