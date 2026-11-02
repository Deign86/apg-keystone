import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Attendance Tracker (packages/connectors/attendance): a shortcut on Home, the attendance app's logo, that opens the
// app. The browser preview cannot start another app, so it says so. Finding and starting the app on the desktop are
// tested in the package's own tests.

test('is the attendance app’s logo on Home', async ({ app, screen, browser }) => {
  await app.open('/');

  await expect(screen.getByRole('button', 'Open Attendance Tracker')).toBeVisible();

  const width = await browser.evaluate(async () => {
    const img = document.querySelector('button[aria-label="Open Attendance Tracker"] img');

    return img instanceof HTMLImageElement ? img.decode().then(() => img.naturalWidth, () => 0) : 0;
  });

  expect(width).toBeGreaterThan(0);
});

test('opening it in the browser preview asks for the desktop app', async ({ app, screen }) => {
  await app.open('/');
  await screen.getByRole('button', 'Open Attendance Tracker').tap();

  await expect(screen.getByRole('region', 'Notifications').getByText('Open Keystone’s desktop app to open Alpha Premier Attendance.')).toBeVisible();
});
