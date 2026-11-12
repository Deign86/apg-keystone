import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { chooseNewPassword, emptyCloud, expectHome, keepRecordsHere, makeAccount, marker, resetCode, signIn } from './emulators';

// Signing in to a cloud build (apps/keystone/src/Gate.tsx, platform/firestore.ts), and why Keystone may refuse to
// open the records after it: an account that is not a member (firestore.rules), or no records in the cloud yet. Then
// signing out (docs/adr/0012): from the rail, and on opening Keystone after it sat unused for 10 minutes. And a forgotten
// password (docs/adr/0016): a link to choose a new one, emailed by Firebase (kept by the Auth emulator instead).

test.beforeEach(async () => {
  await emptyCloud();
});

test('asks for the account before anything else, and refuses a wrong password', async ({ app, screen }) => {
  const owner = await makeAccount('owner');

  await app.open('/');
  const form = screen.getByRole('form', 'Sign in');

  await expect(screen.getByRole('heading', { name: 'Sign in to Keystone', level: 1 })).toBeVisible();
  await expect(screen.getByRole('navigation', 'Keystone')).toBeHidden();
  await expect(form.getByRole('button', 'Sign in')).toBeDisabled();

  await signIn(screen, { ...owner, password: `${owner.password}-wrong` });

  await expect(form.getByText('That email and password do not match an account.')).toBeVisible();
  await expect(screen.getByRole('navigation', 'Keystone')).toBeHidden();
});

test('a member on a computer with no records, before any were moved in, is told where to start', async ({ app, screen }) => {
  const staff = await makeAccount('staff');

  await app.open('/');
  await signIn(screen, staff);

  await expect(screen.getByRole('heading', { name: 'Keystone could not open the records', level: 1 })).toBeVisible();
  await expect(screen.getByRole('alert')).toHaveText('APG\'s records are not in the cloud yet. Open Keystone first on the computer that holds them: it moves them in.');
  await expect(screen.getByText('Nothing was changed or saved.')).toBeVisible();
  // The sample data never takes the records' place: nothing was moved in.
  expect(await marker('status')).toBeNull();

  // Still signed in: trying again asks for no password, and says the same.
  await screen.getByRole('button', 'Try again').tap();
  await expect(screen.getByRole('alert')).toHaveText('APG\'s records are not in the cloud yet. Open Keystone first on the computer that holds them: it moves them in.');
  await expect(screen.getByRole('form', 'Sign in')).toBeHidden();
});

test('refuses an account the owner has not added, and signs out to switch to one they have', async ({ app, screen, browser }) => {
  const outsider = await makeAccount();
  const owner = await makeAccount('owner');

  await keepRecordsHere(app, browser, 'the office computer');
  await signIn(screen, outsider);

  await expect(screen.getByRole('alert')).toHaveText('This account may not open APG\'s records. Ask the owner to add it in the Firebase console (keystone/apg/members).');
  expect(await marker('status')).toBeNull();

  await screen.getByRole('button', 'Sign in as someone else').tap();
  await expect(screen.getByRole('heading', { name: 'Sign in to Keystone', level: 1 })).toBeVisible();

  await signIn(screen, owner);
  await expectHome(screen);
});

test('signs out from the rail, and asks for the account again, also after a reload', async ({ app, screen, browser }) => {
  const owner = await makeAccount('owner');

  await keepRecordsHere(app, browser, 'the office computer');
  await signIn(screen, owner);
  await expectHome(screen);

  const rail = screen.getByRole('navigation', 'Keystone');

  await expect(rail.getByText('Owner · Owner')).toBeVisible();
  await rail.getByRole('button', 'Sign out').tap();

  await expect(screen.getByRole('heading', { name: 'Sign in to Keystone', level: 1 })).toBeVisible();
  await expect(screen.getByRole('navigation', 'Keystone')).toBeHidden();

  await browser.reload();
  await expect(screen.getByRole('heading', { name: 'Sign in to Keystone', level: 1 })).toBeVisible();

  await signIn(screen, owner);
  await expectHome(screen);
});

test('asks for the account again when Keystone was last used 10 minutes ago, and not when it was used just now', async ({ app, screen, browser }) => {
  const owner = await makeAccount('owner');

  await keepRecordsHere(app, browser, 'the office computer');
  await signIn(screen, owner);
  await expectHome(screen);

  // Used a minute ago: still signed in.
  await browser.evaluate(() => localStorage.setItem('keystone-last-used', String(Date.now() - 60_000)));
  await browser.reload();
  await expectHome(screen);

  // Closed, or the computer asleep, for 11 minutes since.
  await browser.evaluate(() => localStorage.setItem('keystone-last-used', String(Date.now() - 11 * 60_000)));
  await browser.reload();
  await expect(screen.getByRole('heading', { name: 'Sign in to Keystone', level: 1 })).toBeVisible();

  await signIn(screen, owner);
  await expectHome(screen);
});

test('a forgotten password: a link to choose a new one, then signing in with it', async ({ app, screen, browser }) => {
  const owner = await makeAccount('owner', 'Mark Reyes');

  await keepRecordsHere(app, browser, 'the office computer');
  await screen.getByRole('form', 'Sign in').getByRole('textbox', 'Email').fill(owner.email);
  await screen.getByRole('button', 'Forgot password?').tap();

  // The email typed comes along; Send link asks Firebase to email the link.
  const form = screen.getByRole('form', 'Forgot password');

  await expect(screen.getByRole('heading', { name: 'Forgot your password?', level: 1 })).toBeVisible();
  await expect(form.getByRole('textbox', 'Email')).toHaveValue(owner.email);
  await form.getByRole('button', 'Send link').tap();
  await expect(screen.getByRole('status')).toHaveText(
    `If ${owner.email} has a Keystone account, a link to choose a new password is on its way to it. It can take a few minutes; look in spam too.`,
  );

  // The owner opens the emailed link and chooses a new password; the old one no longer signs in.
  const code = await resetCode(owner.email);

  expect(code).not.toBeNull();
  await chooseNewPassword(code ?? '', 'a-new-password-1');
  await screen.getByRole('button', 'Back to sign in').tap();
  await signIn(screen, owner);
  await expect(screen.getByRole('form', 'Sign in').getByText('That email and password do not match an account.')).toBeVisible();

  await signIn(screen, { ...owner, password: 'a-new-password-1' });
  await expectHome(screen);
});

test('asking for a link for an email with no account says the same, and sends nothing', async ({ app, screen }) => {
  await app.open('/');
  await screen.getByRole('button', 'Forgot password?').tap();
  await screen.getByRole('form', 'Forgot password').getByRole('textbox', 'Email').fill('nobody@keystone.test');
  await screen.getByRole('button', 'Send link').tap();

  await expect(screen.getByRole('status')).toHaveText(/^If nobody@keystone\.test has a Keystone account, a link to choose a new password is on its way to it\./);
  expect(await resetCode('nobody@keystone.test')).toBeNull();
});
