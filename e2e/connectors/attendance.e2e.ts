import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Attendance Tracker (packages/connectors/attendance). The browser preview cannot reach the kiosk, so these tests check
// its card, its settings, and that a kiosk Keystone cannot reach stays on its own card. Its client is tested against a
// fake kiosk in the package's own tests.

test('asks to be set up on Home, and Settings opens Connections', async ({ app, screen }) => {
  await app.open('/');
  const card = screen.getByRole('region', 'Attendance Tracker');

  await expect(card.getByText('Enter the kiosk’s address to see today’s attendance here.')).toBeVisible();
  await card.getByRole('button', 'Settings').tap();

  await expect(screen.getByRole('heading', { name: 'Connections', level: 1 })).toBeVisible();
});

test('a kiosk it cannot reach shows offline on its own card only, and the address is kept', async ({ app, screen }) => {
  await app.open('/#connections');
  const card = screen.getByRole('region', 'Attendance Tracker');

  await card.getByRole('textbox', 'Kiosk address').fill('127.0.0.1:9');
  await card.getByRole('button', 'Save and connect').tap();

  await expect(card.getByText('Offline')).toBeVisible();
  await expect(card.getByText('Open Keystone’s desktop app to reach the kiosk; the browser preview cannot.')).toBeVisible();

  // The other systems and the rest of Keystone are unaffected.
  await expect(screen.getByRole('region', 'APG Website').getByText('Desktop only')).toBeVisible();
  await expect(screen.getByRole('region', 'Alpha Branding Studio').getByText('Desktop only')).toBeVisible();

  await app.open('/#overview');
  await expect(screen.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();

  await app.open('/#connections');
  await expect(screen.getByRole('region', 'Attendance Tracker').getByRole('textbox', 'Kiosk address')).toHaveValue('127.0.0.1:9');
});
