import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// User Accounts (packages/modules/accounts) in a build that keeps its records on this computer, where nobody signs in:
// it says so and offers no account to make. The owner making accounts in the cloud is e2e/cloud/accounts.e2e.ts.

test('is under Settings on the rail, after Profile, and has no accounts to make on this computer', async ({ app, screen }) => {
  await app.open('/');
  const rail = screen.getByRole('navigation', 'Keystone').getByRole('list').getByRole('button');
  const names = await rail.allTextContents();
  const accounts = names.findIndex((n) => n.endsWith('User Accounts'));

  expect(names[accounts - 1].replace(/^[\d\s]*/, '')).toBe('Profile');
  expect(names.slice(accounts + 1).map((n) => n.replace(/^[\d\s]*/, ''))).toEqual(['Data', 'Bank Accounts', 'Company Details']);
  await rail.nth(accounts).tap();

  await expect(screen.getByRole('heading', { name: 'User Accounts', level: 1 })).toBeVisible();
  await expect(screen.getByText('Settings', { exact: true })).toBeVisible();
  await expect(screen.getByText('This Keystone keeps its records on this computer, where nobody signs in, so there are no accounts to make.')).toBeVisible();
  await expect(screen.getByText('Accounts come with APG\'s records in the cloud: there, the owner makes one here for each staff member, and they sign in with it on any computer or phone.')).toBeVisible();
  await expect(screen.getByRole('button', 'Make account')).toBeHidden();
  await expect(screen.getByRole('button', 'Change password')).toBeHidden();
});
