import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// The shell (packages/kit): the rail, keyboard shortcuts, the saved state, and a screen per installed part. Each
// screen's own behaviour is tested in e2e/modules/ and e2e/connectors/.

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

// Reads the rail rather than a list, so a screen added later is opened here without editing this test.
test('whatever the rail lists opens without hitting the error panel', async ({ app, screen }) => {
  await app.open('/');
  const entries = screen.getByRole('navigation', 'Keystone').getByRole('list').getByRole('button');
  const count = await entries.count();

  expect(count).toBeGreaterThan(SCREENS.length);

  for (let index = 0; index < count; index += 1) {
    await entries.nth(index).tap();

    await expect(screen.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
    await expect(screen.getByText('This screen hit a problem')).toBeHidden();
  }
});

test('Ctrl+1 to Ctrl+8 open the screens in rail order, and Ctrl+0 goes home', async ({ app, screen, browser }) => {
  await app.open('/');

  for (const [index, title] of SCREENS.entries()) {
    await browser.keyboard.press(`Control+${index + 1}`);

    await expect(screen.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  }

  await browser.keyboard.press('Control+0');
  await expect(screen.getByRole('heading', { name: 'Good morning', level: 1 })).toBeVisible();
});

test('keeps saved work after a reload', async ({ app, screen, browser }) => {
  await app.open('/#vouchers');
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('textbox', 'Line 1 description').fill('Office supplies for November');
  await form.getByRole('textbox', 'Line 1 amount').fill('1250.50');
  await form.getByRole('button', 'Save and route for approval').tap();
  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^CV-2026-0142 /)).toBeVisible();

  await browser.reload();

  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^CV-2026-0142 .* For Approval/)).toBeVisible();
});
