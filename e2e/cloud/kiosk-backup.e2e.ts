import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { asMember, commitAs, deleteAsMember, empty, emptyCloud, idToken, makeAccount, setDevice, whole, words } from './emulators';

// The attendance kiosk's backup (docs/adr/0027). Keystone does not write it: the kiosk
// (Deign86/alpha-premier-attendance) does, in batches over Firestore's REST API, signed in as a device. Its own
// database stays the source of truth. These tests ask firestore.rules what that is allowed: a device writes and
// removes documents under att_…, and cannot read them back; only an owner reads them; nobody else touches them; and
// a batch that reaches outside att_… writes nothing at all.

test.beforeEach(async () => {
  await emptyCloud();
});

const intern = { user_id: words('APG-2026-101'), full_name: words('Juan Dela Cruz'), daily_rate_centavos: whole(50000), gender: empty };
const day = { attendance_id: words('A-1'), user_id: words('APG-2026-101'), time_in: words('2026-11-02T00:01:00Z'), time_out: empty };

test('a kiosk device writes its backup in batches, and only an owner reads it', async () => {
  const owner = await makeAccount('owner');
  const staff = await makeAccount('staff', 'Ana Cruz');
  const kiosk = await makeAccount();
  const stranger = await makeAccount();
  const [ownerToken, staffToken, kioskToken, strangerToken] = await Promise.all([owner, staff, kiosk, stranger].map(idToken));

  // An account nobody listed as a device writes nothing.
  expect(await commitAs(kioskToken, [['/att_users/APG-2026-101', intern]])).toBe(403);

  await setDevice(kiosk.uid, 'Attendance kiosk');
  expect(await commitAs(kioskToken, [['/att_users/APG-2026-101', intern], ['/att_attendance/A-1', day]])).toBe(200);
  // The same batch again is the same documents: sending twice is harmless.
  expect(await commitAs(kioskToken, [['/att_users/APG-2026-101', intern], ['/att_attendance/A-1', day]])).toBe(200);
  expect(await commitAs(kioskToken, [['/att_attendance/A-1', { ...day, time_out: words('2026-11-02T09:00:00Z') }]])).toBe(200);

  // Only an owner reads it. The kiosk cannot read back what it wrote.
  expect(await asMember(ownerToken, '/att_users/APG-2026-101')).toBe(200);
  expect(await asMember(ownerToken, '/att_attendance')).toBe(200);
  expect(await asMember(kioskToken, '/att_users/APG-2026-101')).toBe(403);
  expect(await asMember(kioskToken, '/att_users')).toBe(403);
  expect(await asMember(staffToken, '/att_users/APG-2026-101')).toBe(403);
  expect(await asMember(staffToken, '/att_attendance')).toBe(403);
  expect(await asMember(strangerToken, '/att_users/APG-2026-101')).toBe(403);

  // Nobody but the kiosk writes it: not a member, not a stranger, and not an owner, since Keystone never does.
  expect(await commitAs(staffToken, [['/att_users/APG-2026-102', intern]])).toBe(403);
  expect(await commitAs(strangerToken, [['/att_users/APG-2026-102', intern]])).toBe(403);
  expect(await commitAs(ownerToken, [['/att_users/APG-2026-102', intern]])).toBe(403);
  expect(await deleteAsMember(staffToken, '/att_users/APG-2026-101')).toBe(403);
  expect(await deleteAsMember(ownerToken, '/att_users/APG-2026-101')).toBe(403);

  // A record removed on the kiosk is removed here.
  expect(await commitAs(kioskToken, [['/att_attendance/A-1', null]])).toBe(200);
  expect(await asMember(ownerToken, '/att_attendance/A-1')).toBe(404);
  expect(await asMember(ownerToken, '/att_users/APG-2026-101')).toBe(200);
});

test('a backup batch that reaches outside the backup writes nothing', async () => {
  const owner = await makeAccount('owner');
  const kiosk = await makeAccount();
  await setDevice(kiosk.uid, 'Attendance kiosk');
  const ownerToken = await idToken(owner);
  const kioskToken = await idToken(kiosk);

  // Keystone's own records, its members, the register, another device, and a name that only looks like the backup.
  const outside: readonly string[] = ['/dir/0', `/members/${kiosk.uid}`, '/idreg/APG-2026-900', '/devices/another', '/att_/x', '/attendance/x', '/att_Users/x', '/att_users/x/deeper/y'];

  for (const path of outside) {
    expect(await commitAs(kioskToken, [['/att_users/APG-2026-101', intern], [path, intern]])).toBe(403);
    expect(await commitAs(kioskToken, [[path, intern]])).toBe(403);
  }

  // The good half of each refused batch was not written either.
  expect(await asMember(ownerToken, '/att_users/APG-2026-101')).toBe(404);
  expect(await asMember(ownerToken, `/members/${kiosk.uid}`)).toBe(404);
  expect(await asMember(ownerToken, '/dir/0')).toBe(404);

  // Removed from the devices, the kiosk writes nothing more.
  expect(await commitAs(kioskToken, [['/att_users/APG-2026-101', intern]])).toBe(200);
  expect(await deleteAsMember(ownerToken, `/devices/${kiosk.uid}`)).toBe(200);
  expect(await commitAs(kioskToken, [['/att_users/APG-2026-102', intern]])).toBe(403);
});
