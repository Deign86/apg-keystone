import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import {
  asMember, createAsMember, deleteAsMember, emptyCloud, field, flag, idToken, internsAs, makeAccount, setDevice, whole, words,
  type Account, type FirestoreValue,
} from './emulators';

// The register of issued employee IDs (docs/adr/0025). Keystone does not write it: the Alpha Premier ID Maker
// (Deign86/apg-id-creator) does, over Firestore's REST API, signed in as a Keystone member. These tests ask
// firestore.rules what that app is allowed: a member adds an ID under its own number, as themselves; the same number
// cannot be added twice, changed or removed by anyone; a replacement goes under the card it replaces; and someone who
// is not a member reads and writes nothing.

test.beforeEach(async () => {
  await emptyCloud();
});

/**
 * Whether a create was turned away because the number already has a document. Firestore answers 409 (already there)
 * when it looks before asking the rules and 403 when the rules, which allow no update, answer first; either way
 * nothing was written, and the ID Maker treats both the same.
 */
const taken = (status: number) => status === 409 || status === 403;

/** An issued ID as the ID Maker sends it (apg-id-creator, windows/IdMaker.Core/Register.cs › Document). */
const issued = (by: Account, over: Record<string, FirestoreValue> = {}) => ({
  id: words('APG-2026-124'),
  year: whole(2026),
  seq: whole(124),
  name: words('Ana Reyes'),
  title: words('HR Associate'),
  issuedAt: words('2026-11-17T01:30:00.000Z'),
  replacement: flag(false),
  last: words('Reyes'),
  first: words('Ana'),
  middle: words(''),
  suffix: words(''),
  role1: words('HR Associate'),
  role2: words(''),
  by: words(by.uid),
  byEmail: words(by.email),
  ...over,
});

test('a member issues an ID under its own number, and the same number cannot be issued again', async () => {
  const hr = await makeAccount('staff', 'Ana Cruz');
  const other = await makeAccount('staff', 'Ben Santos');
  const hrToken = await idToken(hr);
  const otherToken = await idToken(other);

  expect(await createAsMember(hrToken, '/idreg', 'APG-2026-124', issued(hr))).toBe(200);
  expect(await field('idreg', 'APG-2026-124', 'name')).toBe('Ana Reyes');
  expect(await field('idreg', 'APG-2026-124', 'by')).toBe(hr.uid);

  // Every member reads it: that is the duplicate check.
  expect(await asMember(otherToken, '/idreg/APG-2026-124')).toBe(200);
  expect(await asMember(otherToken, '/idreg')).toBe(200);

  // Another computer issuing the same number is refused, and the first card stands.
  expect(taken(await createAsMember(otherToken, '/idreg', 'APG-2026-124', issued(other, { name: words('Ben Cruz') })))).toBe(true);
  expect(taken(await createAsMember(hrToken, '/idreg', 'APG-2026-124', issued(hr)))).toBe(true);
  expect(await field('idreg', 'APG-2026-124', 'name')).toBe('Ana Reyes');
});

test('an issued ID cannot be changed or removed, by a member or by the CEO', async () => {
  const owner = await makeAccount('owner', 'Mark Reyes');
  const hr = await makeAccount('staff', 'Ana Cruz');
  const ownerToken = await idToken(owner);
  const hrToken = await idToken(hr);

  expect(await createAsMember(hrToken, '/idreg', 'APG-2026-124', issued(hr))).toBe(200);

  // A write over it (asMember writes the document whole) is refused for whoever issued it and for the CEO.
  expect(await asMember(hrToken, '/idreg/APG-2026-124', { name: 'Someone Else' })).toBe(403);
  expect(await asMember(ownerToken, '/idreg/APG-2026-124', { name: 'Someone Else' })).toBe(403);
  expect(await deleteAsMember(hrToken, '/idreg/APG-2026-124')).toBe(403);
  expect(await deleteAsMember(ownerToken, '/idreg/APG-2026-124')).toBe(403);
  expect(await field('idreg', 'APG-2026-124', 'name')).toBe('Ana Reyes');
});

test('an ID is refused unless it is named by its own number and signed by whoever is asking', async () => {
  const hr = await makeAccount('staff', 'Ana Cruz');
  const other = await makeAccount('staff', 'Ben Santos');
  const token = await idToken(hr);

  // Under a number that is not its own, or not an employee number at all.
  expect(await createAsMember(token, '/idreg', 'APG-2026-125', issued(hr))).toBe(403);
  expect(await createAsMember(token, '/idreg', 'whatever', issued(hr, { id: words('whatever') }))).toBe(403);
  // In somebody else's name.
  expect(await createAsMember(token, '/idreg', 'APG-2026-124', issued(other))).toBe(403);
  // Without a name, with the number as text, or carrying something the register does not hold (a photograph, say).
  expect(await createAsMember(token, '/idreg', 'APG-2026-124', issued(hr, { name: words('') }))).toBe(403);
  expect(await createAsMember(token, '/idreg', 'APG-2026-124', issued(hr, { seq: words('124') }))).toBe(403);
  expect(await createAsMember(token, '/idreg', 'APG-2026-124', issued(hr, { photo: words('data:image/png;base64,AAAA') }))).toBe(403);

  // And as it should be, it is taken.
  expect(await createAsMember(token, '/idreg', 'APG-2026-124', issued(hr))).toBe(200);
});

test('an ID says whether it is for an intern or an employee, or says nothing, and nothing else', async () => {
  const hr = await makeAccount('staff', 'Ana Cruz');
  const token = await idToken(hr);
  const numbered = (seq: number) => ({ id: words(`APG-2026-${seq}`), seq: whole(seq) });

  // The ID Maker asks who each ID is for since v2.0.4; the attendance tracker takes interns, and only interns, from it.
  expect(await createAsMember(token, '/idreg', 'APG-2026-201', issued(hr, { ...numbered(201), kind: words('intern') }))).toBe(200);
  expect(await createAsMember(token, '/idreg', 'APG-2026-202', issued(hr, { ...numbered(202), kind: words('employee') }))).toBe(200);
  expect(await field('idreg', 'APG-2026-201', 'kind')).toBe('intern');

  // An ID Maker from before it asked sends none, and is still taken.
  expect(await createAsMember(token, '/idreg', 'APG-2026-203', issued(hr, numbered(203)))).toBe(200);
  expect(await field('idreg', 'APG-2026-203', 'kind')).toBe(null);

  // Anything else is refused: another word, a different case, or not text.
  expect(await createAsMember(token, '/idreg', 'APG-2026-204', issued(hr, { ...numbered(204), kind: words('contractor') }))).toBe(403);
  expect(await createAsMember(token, '/idreg', 'APG-2026-204', issued(hr, { ...numbered(204), kind: words('Intern') }))).toBe(403);
  expect(await createAsMember(token, '/idreg', 'APG-2026-204', issued(hr, { ...numbered(204), kind: flag(true) }))).toBe(403);
  expect(await createAsMember(token, '/idreg', 'APG-2026-204', issued(hr, { ...numbered(204), kind: words('') }))).toBe(403);
});

test('a replacement is recorded under the card it replaces, which stays as it was', async () => {
  const hr = await makeAccount('staff', 'Ana Cruz');
  const token = await idToken(hr);
  const again = issued(hr, { issuedAt: words('2026-12-01T02:00:00.000Z'), replacement: flag(true) });

  expect(await createAsMember(token, '/idreg', 'APG-2026-124', issued(hr))).toBe(200);
  expect(taken(await createAsMember(token, '/idreg', 'APG-2026-124', again))).toBe(true);
  expect(await createAsMember(token, '/idreg/APG-2026-124/replacements', '20261201T020000000Z', again)).toBe(200);
  expect(await field('idreg', 'APG-2026-124', 'issuedAt')).toBe('2026-11-17T01:30:00.000Z');

  // Only a replacement goes there, under its own number, and it too is never changed or removed.
  expect(await createAsMember(token, '/idreg/APG-2026-124/replacements', '20261202T020000000Z', issued(hr))).toBe(403);
  expect(await createAsMember(token, '/idreg/APG-2026-999/replacements', '20261201T020000000Z', again)).toBe(403);
  expect(await asMember(token, '/idreg/APG-2026-124/replacements/20261201T020000000Z', { name: 'Someone Else' })).toBe(403);
  expect(await deleteAsMember(token, '/idreg/APG-2026-124/replacements/20261201T020000000Z')).toBe(403);
});

test('someone who is not a member reads and writes nothing in the register', async () => {
  const hr = await makeAccount('staff', 'Ana Cruz');
  const outsider = await makeAccount();
  const outsiderToken = await idToken(outsider);

  expect(await createAsMember(await idToken(hr), '/idreg', 'APG-2026-124', issued(hr))).toBe(200);

  expect(await asMember(outsiderToken, '/idreg/APG-2026-124')).toBe(403);
  expect(await asMember(outsiderToken, '/idreg')).toBe(403);
  expect(await createAsMember(outsiderToken, '/idreg', 'APG-2026-125', issued(outsider, { id: words('APG-2026-125'), seq: whole(125) }))).toBe(403);
});

// A kiosk's device account (docs/adr/0026): the attendance tracker signs in as one to take new interns from the
// register. It asks two things, how many interns there are and which, and is allowed nothing else.
test('a kiosk device reads the register, counts and lists its interns, and can do nothing else', async () => {
  const owner = await makeAccount('owner');
  const hr = await makeAccount('staff', 'Ana Cruz');
  const kiosk = await makeAccount();
  const hrToken = await idToken(hr);
  const kioskToken = await idToken(kiosk);

  const card = (seq: number, over: Record<string, FirestoreValue> = {}) =>
    issued(hr, { id: words(`APG-2026-${seq}`), seq: whole(seq), ...over });

  expect(await createAsMember(hrToken, '/idreg', 'APG-2026-124', card(124))).toBe(200);
  expect(await createAsMember(hrToken, '/idreg', 'APG-2026-126', card(126, { kind: words('intern') }))).toBe(200);
  expect(await createAsMember(hrToken, '/idreg', 'APG-2026-127', card(127, { kind: words('employee') }))).toBe(200);
  expect(await createAsMember(hrToken, '/idreg', 'APG-2026-128', card(128, { kind: words('intern') }))).toBe(200);

  // An account nobody listed as a device is an outsider.
  expect(await internsAs(kioskToken)).toEqual({ count: 403, counted: null, list: 403, numbers: [] });

  await setDevice(kiosk.uid, 'Attendance kiosk');
  const seen = await internsAs(kioskToken);
  expect(seen.count).toBe(200);
  expect(seen.counted).toBe(2);
  expect(seen.list).toBe(200);
  expect(seen.numbers.sort()).toEqual(['APG-2026-126', 'APG-2026-128']);
  expect(await asMember(kioskToken, '/idreg/APG-2026-126')).toBe(200);
  expect(await asMember(kioskToken, `/devices/${kiosk.uid}`)).toBe(200);

  // It writes nothing: no card, no change, no removal, not even its own listing.
  expect(await createAsMember(kioskToken, '/idreg', 'APG-2026-129', issued(kiosk, { id: words('APG-2026-129'), seq: whole(129) }))).toBe(403);
  expect(await asMember(kioskToken, '/idreg/APG-2026-126', { name: 'Someone Else' })).toBe(403);
  expect(await deleteAsMember(kioskToken, '/idreg/APG-2026-126')).toBe(403);
  expect(await createAsMember(kioskToken, '/devices', 'another', { name: words('Another kiosk') })).toBe(403);
  expect(await deleteAsMember(kioskToken, `/devices/${kiosk.uid}`)).toBe(403);

  // It is not a member: Keystone's records, its members and other devices are closed to it.
  expect(await asMember(kioskToken, '')).toBe(403);
  expect(await asMember(kioskToken, '/members')).toBe(403);
  expect(await asMember(kioskToken, `/members/${hr.uid}`)).toBe(403);
  expect(await asMember(kioskToken, '/dir')).toBe(403);
  expect(await asMember(kioskToken, '/dir/0', { body: 'x' })).toBe(403);
  expect(await asMember(kioskToken, '/rf')).toBe(403);
  expect(await asMember(kioskToken, '/company/details')).toBe(403);
  expect(await asMember(kioskToken, '/devices')).toBe(403);
  expect(await asMember(kioskToken, '/idreg/APG-2026-124/replacements')).toBe(403);

  // Only an owner lists or removes a device; a staff member cannot make one, or see them.
  const ownerToken = await idToken(owner);
  expect(await createAsMember(hrToken, '/devices', hr.uid, { name: words('Mine') })).toBe(403);
  expect(await asMember(hrToken, '/devices')).toBe(403);
  expect(await createAsMember(ownerToken, '/devices', 'second-kiosk', { name: words('Second kiosk') })).toBe(200);
  expect(await createAsMember(ownerToken, '/devices', 'third-kiosk', { name: words('Third'), role: words('owner') })).toBe(403);
  expect(await asMember(ownerToken, '/devices')).toBe(200);

  // Removed from the list, the kiosk is an outsider again.
  expect(await deleteAsMember(ownerToken, `/devices/${kiosk.uid}`)).toBe(200);
  expect(await internsAs(kioskToken)).toEqual({ count: 403, counted: null, list: 403, numbers: [] });
  expect(await asMember(kioskToken, '/idreg/APG-2026-126')).toBe(403);
});
