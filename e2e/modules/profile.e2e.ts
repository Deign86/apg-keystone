import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Profile (packages/modules/profile) in a build that keeps its records on this computer, where nobody signs in: it says
// so and offers no name to change. Changing your name in the cloud is e2e/cloud/accounts.e2e.ts.

test('is first under Settings on the rail, and has no profile to change on this computer', async ({ app, screen }) => {
  await app.open('/');
  const rail = screen.getByRole('navigation', 'Keystone').getByRole('list').getByRole('button');
  const names = (await rail.allTextContents()).map((n) => n.replace(/^[\d\s]*/, ''));
  const profile = names.indexOf('Profile');

  expect(names.slice(profile + 1)).toEqual(['User Accounts', 'Data', 'Bank Accounts', 'Company Details']);
  await rail.nth(profile).tap();

  await expect(screen.getByRole('heading', { name: 'Profile', level: 1 })).toBeVisible();
  await expect(screen.getByText('Settings', { exact: true })).toBeVisible();
  await expect(screen.getByText('This Keystone keeps its records on this computer, where nobody signs in, so there is no profile to change.')).toBeVisible();
  await expect(screen.getByRole('form', 'Your profile')).toBeHidden();
});
