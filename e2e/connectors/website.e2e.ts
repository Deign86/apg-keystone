import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// APG Website (packages/connectors/website), which also brings the Website screen. Browsers block the website's
// admin API, so the preview says so; the client is tested against a fake website in the package's own tests.

test('the Website screen says it needs the desktop app, and links to its setup', async ({ app, screen }) => {
  await app.open('/#website');

  await expect(screen.getByRole('heading', { name: 'Website', level: 1 })).toBeVisible();
  await expect(screen.getByText('Open Keystone’s desktop app to reach the website; browsers block it.')).toBeVisible();
  await expect(screen.getByRole('button', 'Refresh')).toBeDisabled();

  await screen.getByRole('button', 'Set up the website').tap();

  await expect(screen.getByRole('heading', { name: 'Connections', level: 1 })).toBeVisible();
});

test('keeps the admin password out of the saved data', async ({ app, screen, browser }) => {
  await app.open('/#connections');
  const card = screen.getByRole('region', 'APG Website');

  await card.getByRole('textbox', 'Admin email').fill('keystone@alphapremiergroup.com');
  await card.getByRole('textbox', 'Password').fill('e2e-only-password-7731');
  await card.getByRole('button', 'Save and connect').tap();

  await expect(card.getByRole('textbox', 'Admin email')).toHaveValue('keystone@alphapremiergroup.com');
  // The browser preview's stand-in for the keychain is sessionStorage; Keystone's saved data is in localStorage.
  const saved = await browser.evaluate(() => Object.values(localStorage).join('\n'));

  expect(saved).toContain('keystone@alphapremiergroup.com');
  expect(saved).not.toContain('e2e-only-password-7731');
});
