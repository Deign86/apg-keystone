import { test } from '@e2e-dev/web';
import { expect, type Screen } from 'e2e';
import {
  asMember, deleteAsMember, documentIds, emptyCloud, expectHome, field, idToken, makeAccount, recordsInCloud, setMember, setMemberFieldAs, signIn,
} from './emulators';

// The owner making and removing accounts, and anyone changing their own password (docs/adr/0014–0016,
// packages/modules/accounts) or, on Profile, their own name (docs/adr/0020, packages/modules/profile): from User Accounts, the owner makes a staff account, and that person signs in with it on
// another computer and opens the records; once the owner removes it, they open nothing. Staff see who has an account and
// make or remove none, and firestore.rules hold the same line for a member who goes past Keystone.
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

  await recordsInCloud();
  await app.open('/');
  await signIn(screen, owner);
  await expectHome(screen);

  await app.open('/#accounts');
  await expect(screen.getByText('2 people can open APG\'s records. Make an account for each new staff member.')).toBeVisible();
  const table = screen.getByRole('table', 'User accounts');

  await expect(table.getByRole('row', /^Mark Reyes \(you\) — Owner$/)).toBeVisible();
  await expect(table.getByRole('row', /^Ana Cruz — Staff Actions for Ana Cruz$/)).toBeVisible();

  // A slip is caught on the form, and nothing is made.
  const dialog = await makeAccountFor(screen, { ...liza, password: 'short' });

  await expect(dialog.getByRole('alert')).toHaveText('The password needs at least 8 characters.');
  await dialog.getByRole('button', 'Cancel').tap();
  expect(await documentIds('members')).toHaveLength(2);

  const logged = (await documentIds('log')).length;

  await makeAccountFor(screen, liza);
  await expect(screen.getByRole('dialog', 'Liza Bautista can now sign in as liza.bautista@keystone.test.')).toBeVisible();
  await expect(table.getByRole('row', /^Liza Bautista liza\.bautista@keystone\.test Staff Actions for Liza Bautista$/)).toBeVisible();
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

test('an email that already has a sign-in is refused, and nothing is made', async ({ app, screen }) => {
  const owner = await makeAccount('owner', 'Mark Reyes');
  // Made in the Firebase console, never made a member.
  const outsider = await makeAccount();

  await recordsInCloud();
  await app.open('/');
  await signIn(screen, owner);
  await expectHome(screen);
  await app.open('/#accounts');

  const dialog = await makeAccountFor(screen, { ...liza, email: outsider.email });

  await expect(dialog.getByRole('alert')).toHaveText('That email already has a sign-in. If it cannot open the records yet, add it under keystone/apg/members in the Firebase console (docs/FIREBASE.md).');
  await expect(dialog.getByRole('button', 'Make account')).toBeEnabled();
  expect(await documentIds('members')).toEqual([owner.uid]);
});

test('an owner no longer one by the time they make an account is refused, and leaves no sign-in behind', async ({ app, screen }) => {
  const owner = await makeAccount('owner', 'Mark Reyes');

  await recordsInCloud();
  await app.open('/');
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

test('the owner removes a staff account after asking, and that person can no longer open the records', async ({ app, screen }) => {
  const owner = await makeAccount('owner', 'Mark Reyes');
  const hr = await makeAccount('staff', 'Ana Cruz');

  await recordsInCloud();
  await app.open('/');
  await signIn(screen, owner);
  await expectHome(screen);
  await app.open('/#accounts');
  const table = screen.getByRole('table', 'User accounts');

  // The owner's own row has no menu; a staff row's has Remove…, which asks first.
  await expect(table.getByRole('row', /^Ana Cruz — Staff Actions for Ana Cruz$/)).toBeVisible();
  await expect(table.getByRole('button', 'Actions for Mark Reyes')).toBeHidden();
  await table.getByRole('button', 'Actions for Ana Cruz').tap();
  await screen.getByRole('menuitem', 'Remove…').tap();
  const question = screen.getByRole('alertdialog', 'Remove Ana Cruz?');

  await expect(question.getByText(/^Ana Cruz can no longer open APG's records, on any computer or phone\./)).toBeVisible();
  await question.getByRole('button', 'Remove account').tap();

  await expect(screen.getByRole('dialog', 'Ana Cruz can no longer open APG\'s records.')).toBeVisible();
  await expect(table.getByRole('row', /^Ana Cruz/)).toBeHidden();
  await expect(screen.getByText('1 person can open APG\'s records. Make an account for each new staff member.')).toBeVisible();
  expect(await documentIds('members')).toEqual([owner.uid]);

  await app.open('/#activity');
  await screen.getByRole('group', 'Module').getByRole('button', 'User Accounts').tap();
  await expect(screen.getByRole('region', 'Entries').getByRole('listitem').first())
    .toContainText('Account removed for Ana Cruz; they can no longer open APG\'s records.');

  // Ana, on her own computer, still has a sign-in, and it opens nothing.
  await app.clearState();
  await app.open('/');
  await signIn(screen, hr);
  await expect(screen.getByRole('alert')).toHaveText('This account may not open APG\'s records. Ask the owner to add it in the Firebase console (keystone/apg/members).');
  await expect(screen.getByRole('navigation', 'Keystone')).toBeHidden();
});

test('staff change their own password, checked against the current one, and sign in with the new one after', async ({ app, screen }) => {
  const owner = await makeAccount('owner', 'Mark Reyes');
  const hr = await makeAccount('staff', 'Ana Cruz');

  await recordsInCloud();
  await app.open('/');
  await signIn(screen, owner);
  await expectHome(screen);

  // Ana, on her own computer.
  await app.clearState();
  await app.open('/');
  await signIn(screen, hr);
  await expectHome(screen);
  await app.open('/#accounts');
  await expect(screen.getByRole('button', 'Make account')).toBeHidden();
  await screen.getByRole('button', 'Change password').tap();
  const dialog = screen.getByRole('dialog', 'Change password');

  const change = async (current: string) => {
    await dialog.getByLabel('Current password').fill(current);
    await dialog.getByLabel('New password', { exact: true }).fill('anas-new-password');
    await dialog.getByLabel('New password again').fill('anas-new-password');
    await dialog.getByRole('button', 'Change password').tap();
  };

  // The current password is checked by the sign-in itself.
  await change(`${hr.password}-not-it`);
  await expect(dialog.getByRole('alert')).toHaveText('That is not your current password.');

  await change(hr.password);
  await expect(screen.getByRole('dialog', 'Your password is changed. Sign in with the new one from now on.')).toBeVisible();
  await expect(screen.getByRole('navigation', 'Keystone').getByText('Ana Cruz · Staff')).toBeVisible();

  // Signed out, the old password no longer opens Keystone and the new one does.
  await screen.getByRole('navigation', 'Keystone').getByRole('button', 'Sign out').tap();
  await signIn(screen, hr);
  await expect(screen.getByRole('form', 'Sign in').getByText('That email and password do not match an account.')).toBeVisible();
  await signIn(screen, { ...hr, password: 'anas-new-password' });
  // Signing out kept the address, so Keystone reopens on User Accounts.
  await expect(screen.getByRole('navigation', 'Keystone').getByText('Ana Cruz · Staff')).toBeVisible({ timeout: 15_000 });
  await expect(screen.getByRole('heading', { name: 'User Accounts', level: 1 })).toBeVisible();
});

test('staff change their own name on Profile, and every computer shows it', async ({ app, screen }) => {
  const owner = await makeAccount('owner', 'Mark Reyes');
  const hr = await makeAccount('staff', 'Ana Cruz');

  await recordsInCloud();
  await app.open('/');
  await signIn(screen, owner);
  await expectHome(screen);

  // Ana, on her own computer.
  await app.clearState();
  await app.open('/');
  await signIn(screen, hr);
  await expectHome(screen);
  await app.open('/#profile');
  const form = screen.getByRole('form', 'Your profile');

  await expect(form.getByRole('textbox', 'Your name')).toHaveValue('Ana Cruz');
  await form.getByRole('textbox', 'Your name').fill('Ana Cruz-Reyes');
  await form.getByRole('button', 'Save name').tap();

  await expect(screen.getByRole('dialog', 'Keystone shows you as Ana Cruz-Reyes from now on.')).toBeVisible();
  await expect(screen.getByRole('navigation', 'Keystone').getByText('Ana Cruz-Reyes · Staff')).toBeVisible();
  expect(await field('members', hr.uid, 'name')).toBe('Ana Cruz-Reyes');
  expect(await field('members', hr.uid, 'role')).toBe('staff');

  // The owner, on theirs, sees the new name among the accounts.
  await app.clearState();
  await app.open('/');
  await signIn(screen, owner);
  await expectHome(screen);
  await app.open('/#accounts');
  await expect(screen.getByRole('table', 'User accounts').getByRole('row', /^Ana Cruz-Reyes /)).toBeVisible();
});

test('firestore.rules let a member change their own name, and nothing else of theirs or anyone\'s', async () => {
  const owner = await makeAccount('owner', 'Mark Reyes');
  const hr = await makeAccount('staff', 'Ana Cruz');
  const hrToken = await idToken(hr);

  expect(await setMemberFieldAs(hrToken, hr.uid, 'name', 'Ana Cruz-Reyes')).toBe(200);
  expect(await field('members', hr.uid, 'name')).toBe('Ana Cruz-Reyes');

  // Never their role, never a blank name, never someone else's name.
  expect(await setMemberFieldAs(hrToken, hr.uid, 'role', 'owner')).toBe(403);
  expect(await setMemberFieldAs(hrToken, hr.uid, 'name', '')).toBe(403);
  expect(await setMemberFieldAs(hrToken, owner.uid, 'name', 'Someone else')).toBe(403);
  expect(await field('members', hr.uid, 'role')).toBe('staff');
  expect(await field('members', owner.uid, 'name')).toBe('Mark Reyes');
});

test('firestore.rules let only the owner remove a member', async () => {
  const owner = await makeAccount('owner', 'Mark Reyes');
  const hr = await makeAccount('staff', 'Ana Cruz');
  const it = await makeAccount('staff', 'Paolo Santos');
  const [ownerToken, hrToken] = await Promise.all([owner, hr].map(idToken));

  // Staff remove nobody, not even themselves, and never the owner.
  expect(await deleteAsMember(hrToken, `/members/${it.uid}`)).toBe(403);
  expect(await deleteAsMember(hrToken, `/members/${owner.uid}`)).toBe(403);
  expect(await deleteAsMember(hrToken, `/members/${hr.uid}`)).toBe(403);
  expect(await documentIds('members')).toHaveLength(3);

  // The owner can, and then the removed member reads nothing.
  expect(await deleteAsMember(ownerToken, `/members/${it.uid}`)).toBe(200);
  expect(await documentIds('members')).toEqual([owner.uid, hr.uid].sort());
  expect(await asMember(await idToken(it), `/members/${owner.uid}`)).toBe(403);
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
