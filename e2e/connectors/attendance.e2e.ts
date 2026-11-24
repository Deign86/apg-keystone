import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { askedGitHub, ATTENDANCE, fakeDesktop, ID_MAKER, installedAt, LATEST } from '../support/fake-desktop';

// Attendance Tracker (packages/connectors/attendance): a shortcut on Home, the attendance app's logo, that opens the
// app. The browser preview cannot start another app, so it opens its download page. Finding and starting the app on the desktop are
// tested in the package's own tests.
// On Keystone's desktop app (a fake Windows computer, e2e/support/fake-desktop.ts), Home also says when a newer version
// of the app is out, under its shortcut (docs/adr/0035).

test('is the attendance app’s logo on Home', async ({ app, screen, browser }) => {
  await app.open('/');

  await expect(screen.getByRole('button', 'Open Attendance Tracker')).toBeVisible();

  const width = await browser.evaluate(async () => {
    const img = document.querySelector('button[aria-label="Open Attendance Tracker"] img');

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
  await screen.getByRole('button', 'Open Attendance Tracker').tap();

  await expect(screen.getByText('Opened https://github.com/Deign86/alpha-premier-attendance/releases/latest')).toBeVisible();

  await expect(screen.getByRole('region', 'Notifications').getByText('Alpha Premier Attendance runs on a computer, so its download page is open. Install it there, or open it from Keystone’s desktop app.')).toBeVisible();
});

test('on the desktop, an older attendance app is offered its newer version under its shortcut, and the installer opens', async ({ app, screen, browser }) => {
  // The attendance tracker updates itself only while it is open: Home is where Keystone shows it is behind.
  await fakeDesktop(browser, { installed: [installedAt(ATTENDANCE, '0.2.20')], releases: LATEST });
  await app.open('/');

  const shortcut = screen.getByRole('group', 'Attendance Tracker');

  await shortcut.getByRole('button', 'Update to 0.2.57').tap();

  await expect(screen.getByRole('region', 'Notifications').getByText('The installer for Alpha Premier Attendance 0.2.57 is open. Close Alpha Premier Attendance first, then finish the installer.')).toBeVisible();
  await expect(shortcut.getByRole('button', 'Update to 0.2.57')).toBeHidden();
});

test('on the desktop, an attendance app at the latest version is offered nothing', async ({ app, screen, browser }) => {
  await fakeDesktop(browser, { installed: [installedAt(ATTENDANCE, '0.2.57'), installedAt(ID_MAKER, '2.0.3')], releases: LATEST });
  await app.open('/');

  // Asked first (shortcuts are asked in Home's order), so the ID Maker's offer shows only after its answer did.
  await expect(screen.getByRole('group', 'Alpha Premier ID Maker').getByRole('button', 'Update to 2.0.4')).toBeVisible();
  await expect.poll(() => askedGitHub(browser)).toContain('Deign86/alpha-premier-attendance');
  await expect(screen.getByRole('group', 'Attendance Tracker').getByRole('button', /^Update to/)).toHaveCount(0);
});

test('on the desktop, when GitHub will not say, the attendance shortcut offers nothing and still opens the app', async ({ app, screen, browser }) => {
  await fakeDesktop(browser, { installed: [installedAt(ATTENDANCE, '0.2.20'), installedAt(ID_MAKER, '2.0.3')], releases: LATEST, refused: ['Deign86/alpha-premier-attendance'] });
  await app.open('/');

  await expect(screen.getByRole('group', 'Alpha Premier ID Maker').getByRole('button', 'Update to 2.0.4')).toBeVisible();
  const shortcut = screen.getByRole('group', 'Attendance Tracker');

  await expect(shortcut.getByRole('button', /^Update to/)).toHaveCount(0);
  await shortcut.getByRole('button', 'Open Attendance Tracker').tap();
  await expect(shortcut.getByRole('button', 'Open Attendance Tracker')).toBeEnabled();
  await expect(screen.getByRole('region', 'Notifications').getByRole('alert')).toHaveCount(0);
});
