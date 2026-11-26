import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, type Screen } from 'e2e';
import type { Browser, WebApp } from '@e2e-dev/web';
import { parseState, toDocuments, type JsonObject, type TerminalState } from '@keystone/core';

// The Firebase emulators the cloud suite runs against, as `firebase emulators:exec` names them (npm run
// test:e2e:cloud), and what the tests do to them directly: start empty, make accounts, and read what Keystone wrote.
// Reads and setup go in as the emulator's admin (`Bearer owner`), past firestore.rules, as the Firebase console would.

const env = (name: string) => {
  const value = process.env[name];

  if (!value) throw new Error(`${name} is not set. Run the cloud suite with npm run test:e2e:cloud, which starts the Firebase emulators.`);

  return value;
};

export const PROJECT = env('GCLOUD_PROJECT');
export const AUTH_EMULATOR = env('FIREBASE_AUTH_EMULATOR_HOST');
export const FIRESTORE_EMULATOR = env('FIRESTORE_EMULATOR_HOST');

if (!PROJECT.startsWith('demo-')) throw new Error(`The cloud suite runs only against a demo project, not ${PROJECT}.`);

const DATABASE = `http://${FIRESTORE_EMULATOR}/v1/projects/${PROJECT}/databases/(default)`;
const ADMIN = { Authorization: 'Bearer owner' };

async function call(url: string, init: RequestInit = {}) {
  const res = await fetch(url, init);

  if (!res.ok && res.status !== 404) throw new Error(`${init.method ?? 'GET'} ${url} answered ${res.status}: ${await res.text()}`);

  return res;
}

/** Empties both emulators, so each test starts with no accounts and nothing in the cloud. */
export async function emptyCloud() {
  await call(`http://${FIRESTORE_EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await call(`http://${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

export interface Account {
  email: string;
  password: string;
  uid: string;
}

/**
 * A throwaway account in the Auth emulator, with a made-up address and password. With a role, the CEO has also made
 * it a member (keystone/apg/members/<uid>, as docs/FIREBASE.md › Members describes) under `name`; without one, it is not.
 */
export async function makeAccount(role?: 'owner' | 'staff', name = role === 'owner' ? 'Owner' : 'Staff'): Promise<Account> {
  const email = `${role ?? 'outsider'}-${randomUUID().slice(0, 8)}@keystone.test`;
  const password = randomUUID();

  const res = await call(`http://${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });

  // SAFETY: a successful Identity Toolkit signUp (call() throws on any other) answers with the new account's id, localId.
  const { localId: uid } = (await res.json()) as { localId: string };

  if (role) await setMember(uid, role, name);

  return { email, password, uid };
}

/** Makes an account a member with this role and name, or changes them, as the CEO would in the Firebase console. */
export async function setMember(uid: string, role: 'owner' | 'staff', name: string) {
  await call(`${DATABASE}/documents/keystone/apg/members/${uid}`, {
    method: 'PATCH',
    headers: { ...ADMIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { role: { stringValue: role }, name: { stringValue: name } } }),
  });
}

/** Lists an account as a kiosk's device (keystone/apg/devices/<uid>), as the CEO would in the Firebase console. */
export async function setDevice(uid: string, name: string) {
  await call(`${DATABASE}/documents/keystone/apg/devices/${uid}`, {
    method: 'PATCH',
    headers: { ...ADMIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { name: { stringValue: name } } }),
  });
}

/** A document as the Firestore REST API gives it: its full path, and its string fields. */
interface FirestoreDocument {
  name: string;
  fields?: Record<string, { stringValue?: string }>;
}

/** A document under keystone/apg, or null while it does not exist. */
async function readDocument(path: string): Promise<FirestoreDocument | null> {
  const res = await call(`${DATABASE}/documents/keystone/apg${path}`, { headers: ADMIN });

  if (res.status === 404) return null;

  // SAFETY: a successful Firestore REST read (call() throws on any status but 200 and 404) answers with the document.
  return (await res.json()) as FirestoreDocument;
}

/** A field of `keystone/apg` (whether, and by whom, the records were started), or null while the document does not exist. */
export async function marker(field: 'status' | 'by'): Promise<string | null> {
  return (await readDocument(''))?.fields?.[field]?.stringValue ?? null;
}

/** The ids of the documents in one of the record collections (dir, cv, bs, ids, log, ext), sorted. */
export async function documentIds(collection: string): Promise<string[]> {
  const res = await call(`${DATABASE}/documents/keystone/apg/${collection}?pageSize=1000`, { headers: ADMIN });

  // SAFETY: a Firestore REST list answers with its documents, and leaves the field out when there are none.
  const { documents = [] } = (await res.json()) as { documents?: FirestoreDocument[] };

  return documents.map((d) => d.name.slice(d.name.lastIndexOf('/') + 1)).sort();
}

/** The record a document holds (its `body`), parsed, or null while there is none. */
export async function record(collection: string, id: string): Promise<JsonObject | null> {
  const body = (await readDocument(`/${collection}/${id}`))?.fields?.body?.stringValue;

  // SAFETY: Keystone writes each record's body as the JSON text of the record, an object (core › toDocuments).
  return body === undefined ? null : (JSON.parse(body) as JsonObject);
}

/** A string field beside a document's body (a request's `status` or `uid`, which firestore.rules check), or null. */
export async function field(collection: string, id: string, name: string): Promise<string | null> {
  return (await readDocument(`/${collection}/${id}`))?.fields?.[name]?.stringValue ?? null;
}

/** A yes-or-no field beside a document's body (a member's `attendanceAdmin`), or null while it is not set. */
export async function flagField(collection: string, id: string, name: string): Promise<boolean | null> {
  return (await readDocument(`/${collection}/${id}`))?.fields?.[name]?.booleanValue ?? null;
}

/** Signs in through the Auth emulator's REST API, as Keystone's Firebase SDK does, and gives the account's ID token. */
export async function idToken(account: Account): Promise<string> {
  const res = await call(`http://${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: account.email, password: account.password, returnSecureToken: true }),
  });

  // SAFETY: a successful Identity Toolkit signInWithPassword (call() throws on any other) answers with the ID token.
  return ((await res.json()) as { idToken: string }).idToken;
}

/**
 * What firestore.rules answer a member who goes past Keystone: the HTTP status of reading a document under
 * keystone/apg, or of writing it whole as the first record of its list with these string fields, and `maps` of strings, beside `pos`, signed
 * in with `token` (200 allowed, 403 refused).
 */
export async function asMember(token: string, path: string, write?: Record<string, string>, maps: Record<string, Record<string, string>> = {}): Promise<number> {
  const strings = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { stringValue: v }]));

  const fields = write && {
    pos: { integerValue: '0' }, ...strings(write), ...Object.fromEntries(Object.entries(maps).map(([k, m]) => [k, { mapValue: { fields: strings(m) } }])),
  };

  const res = await fetch(`${DATABASE}/documents/keystone/apg${path}`, {
    method: fields ? 'PATCH' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: fields ? JSON.stringify({ fields }) : undefined,
  });

  return res.status;
}

/**
 * What firestore.rules answer a member who changes one string field of a member document and nothing else, as Profile
 * changes a name, signed in with `token` (200 allowed, 403 refused).
 */
export async function setMemberFieldAs(token: string, uid: string, name: string, value: string): Promise<number> {
  const res = await fetch(`${DATABASE}/documents/keystone/apg/members/${uid}?updateMask.fieldPaths=${name}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { [name]: { stringValue: value } } }),
  });

  return res.status;
}

/** What firestore.rules answer a member who deletes a document under keystone/apg, signed in with `token` (200 allowed, 403 refused). */
export async function deleteAsMember(token: string, path: string): Promise<number> {
  const res = await fetch(`${DATABASE}/documents/keystone/apg${path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });

  return res.status;
}

/** A field's value as the Firestore REST API takes it: text, a whole number (which travels as text) or yes/no. */
export type FirestoreValue = { stringValue: string } | { integerValue: string } | { booleanValue: boolean } | { nullValue: null };

export const words = (value: string): FirestoreValue => ({ stringValue: value });
export const whole = (value: number): FirestoreValue => ({ integerValue: String(value) });
export const flag = (value: boolean): FirestoreValue => ({ booleanValue: value });
export const empty: FirestoreValue = { nullValue: null };

/**
 * What firestore.rules answer a member who creates a document under keystone/apg with these fields, signed in with
 * `token`, as the ID Maker creates an issued ID (200 allowed, 403 refused, 409 when it is already there). A create is
 * not a write over: Firestore refuses it for a document that exists before the rules are asked.
 */
export async function createAsMember(token: string, collection: string, id: string, fields: Record<string, FirestoreValue>): Promise<number> {
  const res = await fetch(`${DATABASE}/documents/keystone/apg${collection}?documentId=${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });

  return res.status;
}

/** The interns in the ID register, as the attendance kiosk asks for them (alpha-premier-attendance, services/id_register.rs). */
const INTERNS = {
  from: [{ collectionId: 'idreg' }],
  where: { fieldFilter: { field: { fieldPath: 'kind' }, op: 'EQUAL', value: { stringValue: 'intern' } } },
};

/** One row of a Firestore REST query's answer: a document, a count, or neither when nothing matched. */
interface QueryRow {
  document?: { name: string };
  result?: { aggregateFields: { n: { integerValue: string } } };
}

/**
 * What firestore.rules answer the kiosk's two questions, signed in with `token`: how many interns the register holds,
 * and which. Gives the HTTP status of each (200 allowed, 403 refused) and, when allowed, the count and the numbers.
 */
export async function internsAs(token: string): Promise<{ count: number; counted: number | null; list: number; numbers: string[] }> {
  const ask = (verb: string, body: string) =>
    fetch(`${DATABASE}/documents/keystone/apg:${verb}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
    });

  const counting = { structuredAggregationQuery: { structuredQuery: INTERNS, aggregations: [{ alias: 'n', count: {} }] } };
  const count = await ask('runAggregationQuery', JSON.stringify(counting));
  const list = await ask('runQuery', JSON.stringify({ structuredQuery: INTERNS }));

  // SAFETY: a successful Firestore REST query answers with a list of rows of this shape; a refused one is not read.
  const counted = count.ok ? ((await count.json()) as QueryRow[]) : [];
  // SAFETY: as above.
  const listed = list.ok ? ((await list.json()) as QueryRow[]) : [];

  return {
    count: count.status,
    counted: counted[0]?.result ? Number(counted[0].result.aggregateFields.n.integerValue) : null,
    list: list.status,
    numbers: listed.flatMap((row) => (row.document ? [row.document.name.slice(row.document.name.lastIndexOf('/') + 1)] : [])),
  };
}

/**
 * Sends one batch of writes the way the attendance kiosk's backup does (alpha-premier-attendance,
 * services/cloud_mirror.rs): a `commit` of whole documents under keystone/apg, signed in with `token`. Each entry is a
 * path under keystone/apg and the fields to write, or `null` to remove the document. Gives the HTTP status.
 */
export async function commitAs(token: string, writes: readonly (readonly [string, Record<string, FirestoreValue> | null])[]): Promise<number> {
  const root = `projects/${PROJECT}/databases/(default)/documents/keystone/apg`;

  const body = {
    writes: writes.map(([path, fields]) => (fields ? { update: { name: `${root}${path}`, fields } } : { delete: `${root}${path}` })),
  };

  const response = await fetch(`${DATABASE}/documents:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return response.status;
}

/** The tests' sample records (packages/core/sample/sample.json), with one more log entry saying where these are kept. */
function sampleRecords(where: string): TerminalState {
  const state = parseState(readFileSync(new URL('../../packages/core/sample/sample.json', import.meta.url), 'utf8'));

  state.log.unshift({ when: '2026-10-30 09:00', mod: 'DIR', text: `Records kept ${where}.` });

  return state;
}

/**
 * The records an owner saved in Keystone before the test: the sample records, logged as "Records kept in the cloud.",
 * written as the documents Keystone writes (core › toDocuments), with the records marked as started. Written as the
 * emulator's admin, past firestore.rules.
 */
export async function recordsInCloud() {
  const root = `projects/${PROJECT}/databases/(default)/documents/keystone/apg`;
  const text = (v: string) => ({ stringValue: v });

  const writes = toDocuments(sampleRecords('in the cloud')).map((d) => ({
    update: { name: `${root}/${d.collection}/${d.id}`, fields: { pos: { integerValue: String(d.pos) }, body: text(d.body) } },
  }));

  writes.push({ update: { name: root, fields: { status: text('ready'), by: text('setup') } } });
  await call(`${DATABASE}/documents:commit`, { method: 'POST', headers: { ...ADMIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) });
}

/**
 * Another computer's save, as the cloud gets it: one record's body replaced, or the record deleted (`body` null). For
 * the live updates a Keystone already open must show.
 */
export async function saveElsewhere(collection: string, id: string, body: JsonObject | null) {
  const path = `${DATABASE}/documents/keystone/apg/${collection}/${id}`;

  if (!body) {
    await call(path, { method: 'DELETE', headers: ADMIN });

    return;
  }

  await call(`${path}?updateMask.fieldPaths=body`, {
    method: 'PATCH', headers: { ...ADMIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { body: { stringValue: JSON.stringify(body) } } }),
  });
}

/**
 * Puts records on this computer, where the browser preview keeps them (apps/keystone/src/platform/browser.ts): the
 * sample records, logged as "Records kept on <computer>.", so a test can show they never reach the cloud
 * (docs/adr/0018). Leaves Keystone open on its sign-in screen.
 */
export async function keepRecordsHere(app: WebApp, browser: Browser, computer: string) {
  await app.open('/');
  await browser.evaluate((json: string) => localStorage.setItem('keystone-state', json), JSON.stringify(sampleRecords(`on ${computer}`)));
  await browser.reload();
}

/**
 * The one-time code in the last password-reset link the Auth emulator would have emailed to `email`, or null when it
 * sent none. Nothing is emailed in the emulator; it keeps the links instead.
 */
export async function resetCode(email: string): Promise<string | null> {
  const res = await call(`http://${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT}/oobCodes`);

  // SAFETY: the Auth emulator lists the links it would have emailed as { oobCodes: [{ email, oobCode, requestType }] }.
  const { oobCodes = [] } = (await res.json()) as { oobCodes?: { email: string; oobCode: string; requestType: string }[] };

  return oobCodes.filter((c) => c.email === email && c.requestType === 'PASSWORD_RESET').at(-1)?.oobCode ?? null;
}

/** Chooses a new password with a reset link's code, as the page the emailed link opens does. */
export async function chooseNewPassword(code: string, newPassword: string) {
  await call(`http://${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oobCode: code, newPassword }),
  });
}

/** Signs in on the sign-in screen Keystone opens on. */
export async function signIn(screen: Screen, account: Account) {
  const form = screen.getByRole('form', 'Sign in');

  await form.getByRole('textbox', 'Email').fill(account.email);
  await form.getByLabel('Password').fill(account.password);
  await form.getByRole('button', 'Sign in').tap();
}

/** Keystone itself, past the sign-in: Home's greeting. */
export async function expectHome(screen: Screen) {
  await expect(screen.getByRole('heading', { name: 'Good morning', level: 1 })).toBeVisible({ timeout: 15_000 });
}
