import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { askedGitHub, fakeDesktop, ID_MAKER, installedAt, LATEST, STUDIO } from '../support/fake-desktop';

// Alpha Premier ID Maker (packages/connectors/id-maker-app): a shortcut on Home, the ID Maker's logo, that opens the
// app. The browser preview cannot start another app, so it says so. Finding and starting the app on the desktop are
// tested in the package's own tests.
// On Keystone's desktop app (a fake Windows computer, e2e/support/fake-desktop.ts), Home also says when a newer version
// of the app is out, under its shortcut (docs/adr/0035).

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

test('on the desktop, an older ID Maker is offered its newer version under its shortcut, and the installer opens', async ({ app, screen, browser }) => {
  await fakeDesktop(browser, { installed: [installedAt(ID_MAKER, '2.0.3')], releases: LATEST });
  await app.open('/');

  await screen.getByRole('group', 'Alpha Premier ID Maker').getByRole('button', 'Update to 2.0.4').tap();

  await expect(screen.getByRole('region', 'Notifications').getByText('The installer for Alpha Premier ID Maker 2.0.4 is open. Close Alpha Premier ID Maker first, then finish the installer.')).toBeVisible();
});

test('on the desktop, an ID Maker at the latest version is offered nothing', async ({ app, screen, browser }) => {
  await fakeDesktop(browser, { installed: [installedAt(ID_MAKER, '2.0.4'), installedAt(STUDIO, '2.7.0.0')], releases: LATEST });
  await app.open('/');

  // Asked first (shortcuts are asked in Home's order), so the studio's offer shows only after its answer did.
  await expect(screen.getByRole('group', 'Alpha Branding Studio').getByRole('button', 'Update to 2.8.1')).toBeVisible();
  await expect.poll(() => askedGitHub(browser)).toContain('Deign86/apg-id-creator');
  await expect(screen.getByRole('group', 'Alpha Premier ID Maker').getByRole('button', /^Update to/)).toHaveCount(0);
});
