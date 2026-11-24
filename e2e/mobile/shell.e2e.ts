import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { isPhone, openFromRail } from '../support/mobile';

// The shell on a phone and a tablet (packages/kit): every screen from the rail, or from the Menu on a phone, the
// install hint, and the shortcuts to the other APG apps, which run on a computer.

const SCREENS = ['Overview', 'Check Vouchers', 'Requests for Funds', 'Billing Statements', 'Statements of Account', 'Directory', 'Activity Log', 'Timekeeping', 'Payroll', 'Profile', 'User Accounts', 'Data', 'Bank Accounts', 'Company Details'];

test('opens every screen from the rail, or from the Menu on a phone, which closes once one is picked', async ({ app, screen, browser }) => {
  await app.open('/');
  const phone = await isPhone(browser);

  // A phone has the brand and a Menu button across the top; a tablet the rail down the side.
  await expect(screen.getByRole('button', 'Menu')).toBeVisible({ visible: phone });

  for (const title of SCREENS) {
    await openFromRail(screen, browser, title);

    await expect(screen.getByRole('main').getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await expect(screen.getByText('This screen hit a problem')).toBeHidden();

    if (phone) await expect(screen.getByRole('dialog', 'Keystone')).toBeHidden();
  }
});

test('says how to put Keystone on the home screen: from the Share menu on an iPhone, nothing where the browser offers it', async ({ app, screen, browser }) => {
  await app.open('/');
  const iphone = await browser.evaluate(() => /iPhone/.test(navigator.userAgent));

  if (await isPhone(browser)) await screen.getByRole('button', 'Menu').tap();
  const rail = screen.getByRole('navigation', 'Keystone');

  await expect(rail.getByText('Browser preview · saved in this browser')).toBeVisible();
  // An Android tablet's Chrome offers its own dialog once the built app's worker is running; the dev server has none.
  await expect(rail.getByText('To open Keystone like an app, tap Share, then Add to Home Screen.')).toBeVisible({ visible: iphone });
  // No keyboard to press the screens' shortcuts on: they are not shown on a phone.
  await expect(rail.getByText('Ctrl+0 home · Ctrl+1–Ctrl+9 screens')).toBeVisible({ visible: !(await isPhone(browser)) });
});

test('a connected desktop app opens its download page, to install it on a computer', async ({ app, screen, browser }) => {
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

  // The website is a website: it opens as on the desktop.
  await screen.getByRole('button', 'Open APG Website').tap();
  await expect(screen.getByText('Opened https://alphapremiergroup.com/admin')).toBeVisible();
});
