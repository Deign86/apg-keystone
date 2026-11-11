import { test } from '@e2e-dev/web';
import { expect, type Screen } from 'e2e';
import { asMember, documentIds, emptyCloud, expectHome, field, idToken, keepRecordsHere, makeAccount, setMember, signIn } from './emulators';

// The owner making accounts (docs/adr/0013, packages/modules/accounts): from User Accounts, the owner makes a staff
// account, and that person signs in with it on another computer and opens the records. Staff see who has an account
// and make none, and firestore.rules hold the same line for a member who goes past Keystone.
// app.clearState() is another computer, signed out and empty.

test.beforeEach(async () => {
  await emptyCloud();
});

const liza = { name: 'Liza Bautista', email: 'liza.bautista@keystone.test', password: 'starting-password-1' };

/** Fills in the owner's Make account dialog and sends it. */
async function makeAccountFor(screen: Screen, person: { name: string; email: string; password: string }) {
  await screen.getByRole('button', 'Make account').tap();
  const dialog = screen.getByRole('dialog', 'Make account');

  await dialog.getByRole('textbox', 'Name').fill(person.name);
  await dialog.getByRole('textbox', 'Email').fill(person.email);
  await dialog.getByLabel('Password').fill(person.password);
  await dialog.getByRole('button', 'Make account').tap();

  return dialog;
}

test('the owner makes a staff account, and that person signs in with it on another computer', async ({ app, screen, browser }) => {
  const owner = await makeAccount('owner', 'Mark Reyes');
  const hr = await makeAccount('staff', 'Ana Cruz');

  await keepRecordsHere(app, browser, 'the office computer');
  await signIn(screen, owner);
  await expectHome(screen);

  await app.open('/#accounts');
  await expect(screen.getByText('2 people can open APG\'s records. Make an account for each new staff member.')).toBeVisible();
  const table = screen.getByRole('table', 'User accounts');

  await expect(table.getByRole('row', /^Mark Reyes \(you\) — Owner$/)).toBeVisible();
  await expect(table.getByRole('row', /^Ana Cruz — Staff$/)).toBeVisible();

  // A slip is caught on the form, and nothing is made.
  const dialog = await makeAccountFor(screen, { ...liza, password: 'short' });

  await expect(dialog.getByRole('alert')).toHaveText('The password needs at least 8 characters.');
  await dialog.getByRole('button', 'Cancel').tap();
  expect(await documentIds('members')).toHaveLength(2);

  const logged = (await documentIds('log')).length;

  await makeAccountFor(screen, liza);
  await expect(screen.getByRole('dialog', 'Liza Bautista can now sign in as liza.bautista@keystone.test.')).toBeVisible();
  await expect(table.getByRole('row', /^Liza Bautista liza\.bautista@keystone\.test Staff$/)).toBeVisible();
  await expect(screen.getByText('3 people can open APG\'s records. Make an account for each new staff member.')).toBeVisible();

  // Its log line reaches the cloud. Making it signed nobody else in here: reopened, Keystone is still the owner's.
  await expect.poll(async () => (await documentIds('log')).length, { timeout: 10_000 }).toBe(logged + 1);
  await browser.reload();
  await expect(screen.getByRole('navigation', 'Keystone').getByText('Mark Reyes · Owner')).toBeVisible({ timeout: 15_000 });

  // The new member is in the cloud as staff.
  const uid = (await documentIds('members')).find((id) => id !== owner.uid && id !== hr.uid) ?? '';

  expect(await field('members', uid, 'role')).toBe('staff');
  expect(await field('members', uid, 'name')).toBe('Liza Bautista');
  expect(await field('members', uid, 'email')).toBe('liza.bautista@keystone.test');

  // The Activity Log says who made whose account, and never the password.
  await app.open('/#activity');
  await screen.getByRole('group', 'Module').getByRole('button', 'User Accounts').tap();
  const entries = screen.getByRole('region', 'Entries').getByRole('listitem');

  await expect(entries).toHaveCount(1);
  await expect(entries.first()).toContainText('Account made for Liza Bautista (liza.bautista@keystone.test), staff.');

  // Liza signs in on her own computer and opens the same records, as staff.
  await app.clearState();
  await app.open('/');
  await signIn(screen, { ...liza, uid });
  await expectHome(screen);
  const rail = screen.getByRole('navigation', 'Keystone');

  await expect(rail.getByText('Liza Bautista · Staff')).toBeVisible();

  // Staff see who has an account, and make none.
  await rail.getByRole('button', /User Accounts$/).tap();
  await expect(screen.getByText('3 people can open APG\'s records. Only the owner makes accounts.')).toBeVisible();
  await expect(screen.getByRole('table', 'User accounts').getByRole('row', /^Liza Bautista \(you\) liza\.bautista@keystone\.test Staff$/)).toBeVisible();
  await expect(screen.getByRole('button', 'Make account')).toBeHidden();
});

test('an email that already has a sign-in is refused, and nothing is made', async ({ app, screen, browser }) => {
  const owner = await makeAccount('owner', 'Mark Reyes');
  // Made in the Firebase console, never made a member.
  const outsider = await makeAccount();

  await keepRecordsHere(app, browser, 'the office computer');
  await signIn(screen, owner);
  await expectHome(screen);
  await app.open('/#accounts');

  const dialog = await makeAccountFor(screen, { ...liza, email: outsider.email });

  await expect(dialog.getByRole('alert')).toHaveText('That email already has a sign-in. If it cannot open the records yet, add it under keystone/apg/members in the Firebase console (docs/FIREBASE.md).');
  await expect(dialog.getByRole('button', 'Make account')).toBeEnabled();
  expect(await documentIds('members')).toEqual([owner.uid]);
});

test('an owner no longer one by the time they make an account is refused, and leaves no sign-in behind', async ({ app, screen, browser }) => {
  const owner = await makeAccount('owner', 'Mark Reyes');

  await keepRecordsHere(app, browser, 'the office computer');
  await signIn(screen, owner);
  await expectHome(screen);
  await app.open('/#accounts');

  // Made staff in the console while Keystone is open: the screen still offers Make account, and firestore.rules refuse it.
  await setMember(owner.uid, 'staff', 'Mark Reyes');
  const dialog = await makeAccountFor(screen, liza);

  await expect(dialog.getByRole('alert')).toHaveText('Only the owner makes accounts.');
  expect(await documentIds('members')).toEqual([owner.uid]);

  // Owner again, the same email is free: the refused attempt took its sign-in back.
  await setMember(owner.uid, 'owner', 'Mark Reyes');
  await dialog.getByRole('button', 'Make account').tap();
  await expect(screen.getByRole('dialog', 'Liza Bautista can now sign in as liza.bautista@keystone.test.')).toBeVisible();
  expect(await documentIds('members')).toHaveLength(2);
});

test('firestore.rules let only the owner make someone a member', async () => {
  const owner = await makeAccount('owner', 'Mark Reyes');
  const hr = await makeAccount('staff', 'Ana Cruz');
  const outsider = await makeAccount();
  const [ownerToken, hrToken, outsiderToken] = await Promise.all([owner, hr, outsider].map(idToken));
  const member = { role: 'staff', name: 'Someone', email: outsider.email };

  // Staff can read who is a member, but cannot add one, nor make themselves the owner; an outsider cannot add itself.
  expect(await asMember(hrToken, `/members/${owner.uid}`)).toBe(200);
  expect(await asMember(hrToken, `/members/${outsider.uid}`, member)).toBe(403);
  expect(await asMember(hrToken, `/members/${hr.uid}`, { role: 'owner', name: 'Ana Cruz' })).toBe(403);
  expect(await asMember(outsiderToken, `/members/${outsider.uid}`, member)).toBe(403);
  expect(await field('members', hr.uid, 'role')).toBe('staff');

  // The owner can.
  expect(await asMember(ownerToken, `/members/${outsider.uid}`, member)).toBe(200);
  expect(await field('members', outsider.uid, 'role')).toBe('staff');
});
