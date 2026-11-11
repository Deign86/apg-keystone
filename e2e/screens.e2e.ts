import { readFileSync } from 'node:fs';
import { test, type Browser, type WebApp } from '@e2e-dev/web';
import { expect } from 'e2e';

// The shell (packages/kit): the rail, keyboard shortcuts, the saved state, and a screen per installed part. Each
// screen's own behaviour is tested in e2e/modules/ and e2e/connectors/.

// Every screen on the rail opens in a real browser, shows its title and does not hit the
// error panel. The rail button's name also carries its shortcut badge, hence the pattern.
const SCREENS = ['Overview', 'Check Vouchers', 'Billing Statements', 'ID Maker', 'Directory', 'Activity Log', 'Timekeeping', 'Payroll', 'Data'];

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

test('the rail marks the screen that is open, and its brand goes home', async ({ app, screen }) => {
  await app.open('/#payroll');
  const rail = screen.getByRole('navigation', 'Keystone');

  await expect(rail.getByRole('button', /Payroll$/)).toHaveAttribute('aria-current', 'page');
  await expect(rail.getByRole('button', /Home$/)).not.toHaveAttribute('aria-current');

  await rail.getByRole('button', 'ALPHA PREMIER KEYSTONE Tektite East Tower, Ortigas Center, Pasig').tap();
  await expect(screen.getByRole('heading', { name: 'Good morning', level: 1 })).toBeVisible();
  await expect(rail.getByRole('button', /Home$/)).toHaveAttribute('aria-current', 'page');
  await expect(rail.getByRole('button', /Payroll$/)).not.toHaveAttribute('aria-current');
});

// The keys read Ctrl+ on Windows and Linux, where the suite runs; a Mac shows ⌘ instead.
test('the foot of the rail says where the data is kept and which keys open the screens', async ({ app, screen }) => {
  await app.open('/');
  const rail = screen.getByRole('navigation', 'Keystone');

  await expect(rail.getByText('Administrator access')).toBeVisible();
  await expect(rail.getByText('Browser preview · saved in this browser')).toBeVisible();
  await expect(rail.getByText('Ctrl+0 home · Ctrl+1–Ctrl+9 screens')).toBeVisible();
});

// The screen lives in the address (#payroll), so a link or a bookmark opens it (packages/kit/src/context.tsx).
test('opens the screen the address names, falls back to Home for one it does not know, and follows the address while open', async ({ app, screen, browser }) => {
  await app.open('/#nope');
  await expect(screen.getByRole('heading', { name: 'Good morning', level: 1 })).toBeVisible();

  await browser.evaluate('location.hash = "#payroll"');
  await expect(screen.getByRole('heading', { name: 'Payroll', level: 1 })).toBeVisible();
  await expect(screen.getByRole('navigation', 'Keystone').getByRole('button', /Payroll$/)).toHaveAttribute('aria-current', 'page');

  await browser.evaluate('location.hash = "#directory"');
  await expect(screen.getByRole('heading', { name: 'Directory', level: 1 })).toBeVisible();
});

// A refusal stays 6 seconds; Dismiss, which shows once the pointer is over the message, takes it away at once.
test('a message can be dismissed before it goes', async ({ app, screen }) => {
  await app.open('/#payroll');
  await screen.getByRole('button', 'Close cut-off').tap();
  const message = screen.getByRole('dialog', 'Set up pay for at least one employee first.');

  await message.hover();
  await message.getByRole('button', 'Dismiss').tap();
  await expect(message).toBeHidden({ timeout: 2_000 });
});

// e2e/support/fixtures/shell-damaged-records.json is the sample data edited by hand: a released voucher has lost its
// particulars, and an old log entry's text is a number. Restoring such a file is refused (data.e2e.ts), but a damaged
// saved state still opens, so it goes where the browser preview keeps the saved state, as a damaged state.json would.
async function keepDamagedRecords(app: WebApp, browser: Browser) {
  const damaged = readFileSync(new URL('support/fixtures/shell-damaged-records.json', import.meta.url), 'utf8');

  await app.open('/');
  await browser.evaluate((json: string) => localStorage.setItem('keystone-state', json), damaged);
  await browser.reload();
}

test('a screen that cannot show its records hits its own error panel, and the rail and every other screen keep working', async ({ app, screen, browser }) => {
  await keepDamagedRecords(app, browser);
  const rail = screen.getByRole('navigation', 'Keystone');

  await rail.getByRole('button', /Check Vouchers$/).tap();
  const panel = screen.getByRole('alert').filter({ hasText: 'This screen hit a problem' });

  // It names the screen (in capitals) and says what went wrong.
  await expect(panel.getByRole('heading', { name: 'This screen hit a problem', level: 1 })).toBeVisible();
  await expect(panel).toContainText('Check Vouchers', { ignoreCase: true });
  await expect(panel).toContainText('The rest of Keystone is unaffected and your data is safe.');

  // Every other screen opens as before, from the rail and from Home.
  await rail.getByRole('button', /Directory$/).tap();
  await expect(screen.getByRole('heading', { name: 'Directory', level: 1 })).toBeVisible();
  await expect(screen.getByText('This screen hit a problem')).toBeHidden();

  await rail.getByRole('button', /Home$/).tap();
  await expect(screen.getByRole('button', /^Check Vouchers .* Awaiting approval 1$/)).toBeVisible();
  await screen.getByRole('button', /^Billing Statements /).tap();
  await expect(screen.getByRole('heading', { name: 'Billing Statements', level: 1 })).toBeVisible();
  await expect(screen.getByText('This screen hit a problem')).toBeHidden();
});

test('Try again brings a screen back once what broke it is gone', async ({ app, screen, browser }) => {
  await keepDamagedRecords(app, browser);
  await screen.getByRole('navigation', 'Keystone').getByRole('button', /Activity Log$/).tap();
  await expect(screen.getByRole('region', 'Entries').getByRole('listitem')).toHaveCount(7);

  // Searching reads every entry's text as words, and the damaged one is a number.
  await screen.getByRole('textbox', 'Search the log').fill('Meralco');
  await expect(screen.getByRole('heading', { name: 'This screen hit a problem', level: 1 })).toBeVisible();

  // Trying again starts the screen afresh, without the search.
  await screen.getByRole('button', 'Try again').tap();
  await expect(screen.getByRole('heading', { name: 'Activity Log', level: 1 })).toBeVisible();
  await expect(screen.getByRole('textbox', 'Search the log')).toHaveValue('');
  await expect(screen.getByRole('region', 'Entries').getByRole('listitem')).toHaveCount(7);
});

test('Ctrl+1 to Ctrl+9 open the screens in rail order, and Ctrl+0 goes home', async ({ app, screen, browser }) => {
  await app.open('/');

  for (const [index, title] of SCREENS.entries()) {
    await browser.keyboard.press(`Control+${index + 1}`);

    await expect(screen.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  }

  await browser.keyboard.press('Control+0');
  await expect(screen.getByRole('heading', { name: 'Good morning', level: 1 })).toBeVisible();
});

// The store writes a change 250 ms after it is made; leaving the page writes it at once (apps/keystone/src/main.tsx).
test('keeps a save made just before the page reloads', async ({ app, screen, browser }) => {
  await app.open('/#vouchers');
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('textbox', 'Line 1 description').fill('Office supplies for November');
  await form.getByRole('textbox', 'Line 1 amount').fill('1250.50');

  // Save and reload in the same instant, as someone closing the window right after saving: well inside the 250 ms.
  await browser.evaluate(() => {
    const save = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Save and route for approval');

    save?.click();
    setTimeout(() => location.reload(), 0);
  });

  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^8888-001 .* For Approval/)).toBeVisible();
});

test('keeps saved work after a reload', async ({ app, screen, browser }) => {
  await app.open('/#vouchers');
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('textbox', 'Line 1 description').fill('Office supplies for November');
  await form.getByRole('textbox', 'Line 1 amount').fill('1250.50');
  await form.getByRole('button', 'Save and route for approval').tap();
  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^8888-001 /)).toBeVisible();

  await browser.reload();

  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^8888-001 .* For Approval/)).toBeVisible();
});
