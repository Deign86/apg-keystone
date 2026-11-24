import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { askedGitHub, fakeDesktop, ID_MAKER, installedAt, LATEST, STUDIO } from '../support/fake-desktop';

// Alpha Branding Studio (packages/connectors/branding-studio): a shortcut on Home, the studio's logo, that opens the
// studio. The browser preview cannot start another app, so it opens its download page. Finding and starting the studio on the desktop
// are tested in the package's own tests.
// On Keystone's desktop app (a fake Windows computer, e2e/support/fake-desktop.ts), Home also says when a newer version
// of the app is out, under its shortcut (docs/adr/0035).

test('is the studio’s logo on Home', async ({ app, screen, browser }) => {
  await app.open('/');

  await expect(screen.getByRole('button', 'Open Alpha Branding Studio')).toBeVisible();

  const width = await browser.evaluate(async () => {
    const img = document.querySelector('button[aria-label="Open Alpha Branding Studio"] img');

    return img instanceof HTMLImageElement ? img.decode().then(() => img.naturalWidth, () => 0) : 0;
  });

  expect(width).toBeGreaterThan(0);
});

test('opening it in the browser preview opens its download page, to install it on a computer', async ({ app, screen, browser }) => {
  await app.open('/');
  // Write what would open in a new tab onto the page, where the locator below waits for it.
  await browser.evaluate(() => {
    window.open = (url) => {
      document.body.append(Object.assign(document.createElement('output'), { textContent: `Opened ${String(url)}` }));

      return null;
    };
  });
  await screen.getByRole('button', 'Open Alpha Branding Studio').tap();

  await expect(screen.getByText('Opened https://github.com/Deign86/Alpha_Branding/releases/latest')).toBeVisible();

  await expect(screen.getByRole('region', 'Notifications').getByText('Alpha Branding Studio runs on a computer, so its download page is open. Install it there, or open it from Keystone’s desktop app.')).toBeVisible();
});

test('on the desktop, an older studio is offered its newer version under its shortcut, and the installer opens', async ({ app, screen, browser }) => {
  // The studio updates itself only while it is open: Home is where Keystone shows it is behind.
  await fakeDesktop(browser, { installed: [installedAt(STUDIO, '2.7.0.0')], releases: LATEST });
  await app.open('/');

  await screen.getByRole('group', 'Alpha Branding Studio').getByRole('button', 'Update to 2.8.1').tap();

  await expect(screen.getByRole('region', 'Notifications').getByText('The installer for Alpha Branding Studio 2.8.1 is open. Close Alpha Branding Studio first, then finish the installer.')).toBeVisible();
});

test('on the desktop, a studio at the latest version is offered nothing, though Windows writes it 2.8.1.0', async ({ app, screen, browser }) => {
  await fakeDesktop(browser, { installed: [installedAt(STUDIO, '2.8.1.0'), installedAt(ID_MAKER, '2.0.3')], releases: LATEST });
  await app.open('/');

  // Asked first (shortcuts are asked in Home's order), so the ID Maker's offer shows only after its answer did.
  await expect(screen.getByRole('group', 'Alpha Premier ID Maker').getByRole('button', 'Update to 2.0.4')).toBeVisible();
  await expect.poll(() => askedGitHub(browser)).toContain('Deign86/Alpha_Branding');
  await expect(screen.getByRole('group', 'Alpha Branding Studio').getByRole('button', /^Update to/)).toHaveCount(0);
});
