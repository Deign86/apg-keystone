import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Alpha Premier ID Maker (packages/connectors/id-maker-app): a shortcut on Home, the ID Maker's logo, that opens the
// app. The browser preview cannot start another app, so it says so. Finding and starting the app on the desktop are
// tested in the package's own tests.

test('is the ID Maker’s logo on Home', async ({ app, screen, browser }) => {
  await app.open('/');

  await expect(screen.getByRole('button', 'Open Alpha Premier ID Maker')).toBeVisible();

  const width = await browser.evaluate(async () => {
    const img = document.querySelector('button[aria-label="Open Alpha Premier ID Maker"] img');

    return img instanceof HTMLImageElement ? img.decode().then(() => img.naturalWidth, () => 0) : 0;
  });

  expect(width).toBeGreaterThan(0);
});

test('opening it in the browser preview asks for the desktop app', async ({ app, screen }) => {
  await app.open('/');
  await screen.getByRole('button', 'Open Alpha Premier ID Maker').tap();

  await expect(screen.getByRole('region', 'Notifications').getByText('Open Keystone’s desktop app to open Alpha Premier ID Maker.')).toBeVisible();
});
