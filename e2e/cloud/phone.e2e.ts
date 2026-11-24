import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { layoutProblems } from '../support/mobile';
import { touchScreen } from '../support/touch';
import { chooseNewPassword, emptyCloud, expectHome, makeAccount, recordsInCloud, resetCode, signIn } from './emulators';

// The cloud build on a phone (docs/adr/0047): signing in, a forgotten password and signing out work by touch on the
// smallest phone screen, 320 × 640, as on the desktop (sign-in.e2e.ts).

test.beforeEach(async () => {
  await emptyCloud();
});

test('on a phone: signs in, resets a forgotten password and signs out by touch, every control big enough for a finger', async ({ app, screen, browser }) => {
  const owner = await makeAccount('owner', 'Mark Reyes');

  await recordsInCloud();
  await browser.addInitScript(touchScreen);
  await browser.setViewport({ width: 320, height: 640 });
  await app.open('/');

  await expect(screen.getByRole('heading', { name: 'Sign in to Keystone', level: 1 })).toBeVisible();
  expect(await layoutProblems(browser)).toEqual([]);

  await screen.getByRole('form', 'Sign in').getByRole('textbox', 'Email').fill(owner.email);
  await screen.getByRole('button', 'Forgot password?').tap();
  await expect(screen.getByRole('heading', { name: 'Forgot your password?', level: 1 })).toBeVisible();
  expect(await layoutProblems(browser)).toEqual([]);
  await screen.getByRole('form', 'Forgot password').getByRole('button', 'Send link').tap();
  await expect(screen.getByRole('status')).toHaveText(/^If .* has a Keystone account, a link to choose a new password is on its way to it\./);

  const code = await resetCode(owner.email);

  expect(code).not.toBeNull();
  await chooseNewPassword(code ?? '', 'a-new-password-1');
  await screen.getByRole('button', 'Back to sign in').tap();
  await signIn(screen, { ...owner, password: 'a-new-password-1' });
  await expectHome(screen);
  expect(await layoutProblems(browser)).toEqual([]);

  // Signing out is in the Menu on a phone.
  await screen.getByRole('button', 'Menu').tap();
  await screen.getByRole('navigation', 'Keystone').getByRole('button', 'Sign out').tap();
  await expect(screen.getByRole('heading', { name: 'Sign in to Keystone', level: 1 })).toBeVisible({ timeout: 15_000 });
});
