import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Every screen on the rail opens in a real browser, shows its title and does not hit the
// error panel. The rail button's name also carries its shortcut badge, hence the pattern.
const SCREENS = ['Overview', 'Check Vouchers', 'Billing Statements', 'ID Maker', 'Directory', 'Activity Log', 'Website', 'Connections'];

test('opens on Home with the rail', async ({ app, screen }) => {
  await app.open('/');

  await expect(screen.getByRole('navigation', 'Keystone')).toBeVisible();
  await expect(screen.getByRole('heading', { level: 1 })).toBeVisible();
});

test('every screen on the rail opens', async ({ app, screen }) => {
  await app.open('/');
  const rail = screen.getByRole('navigation', 'Keystone');

  for (const title of SCREENS) {
    await rail.getByRole('button', new RegExp(`${title}$`)).tap();

    await expect(screen.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await expect(screen.getByText('This screen hit a problem')).toBeHidden();
  }
});
