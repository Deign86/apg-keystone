import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import {
  asMember, createAsMember, deleteAsMember, emptyCloud, field, flag, idToken, makeAccount, whole, words, type Account, type FirestoreValue,
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
