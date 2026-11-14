import { readFile } from 'node:fs/promises';
import { test } from '@e2e-dev/web';
import { expect, type Locator, type Screen } from 'e2e';
import { tinyPaperText } from '../support/paper';

// Payroll (packages/modules/payroll). The clock starts at 10:00 on Monday, Nov 2, 2026, so the cut-off to close is
// Oct 16–31, 2026 (11 standard working days). The sample data has four employees and no pay setups. The cut-off
// tests follow days recorded in Timekeeping onto this screen, so they name both.
//
// The regression cut-off is the one the engine's own tests (packages/modules/payroll/test/pay.test.ts), Timekeeping's
// (packages/modules/timekeeping/test/rules.test.ts) and the app's (apps/keystone/src/test/payroll.test.tsx) pin down:
// Juan at ₱760 a day, every kind of day once, ₱9,229.30 net.

/** Fills in Juan Miguel P. Reyes's pay setup with these fields and saves it. */
async function fillPay(form: Locator, fields: Record<string, string>) {
  for (const [label, value] of Object.entries(fields)) await form.getByRole('textbox', label).fill(value);
  await form.getByRole('button', 'Save pay setup').tap();
}

/** Opens Juan Miguel P. Reyes's pay setup from the list. */
async function openJuansPay(screen: Screen) {
  await screen.getByRole('table', 'Pay setup').getByRole('row', /Juan Miguel P\. Reyes/).tap();

  return screen.getByRole('form', 'Pay setup for Juan Miguel P. Reyes');
}

const JUAN = { 'Employee no.': 'APGCO-0013', 'Daily rate': '760', 'Incentives allowance': '1000', 'Special allowance': '150' };

/** With Timekeeping open, corrects Juan's days on Oct 16–31: [row, date as the form names it, in, out, overtime]. */
async function recordDays(screen: Screen, days: [RegExp, string, string, string, string?][]) {
  await screen.getByRole('combobox', 'Cut-off').tap();
  await screen.getByRole('option', 'Oct 16–31, 2026').tap();

  for (const [row, date, timeIn, timeOut, overtime] of days) {
    await screen.getByRole('table', 'Daily time record').getByRole('row', row).tap();
    const form = screen.getByRole('form', `Correct ${date}`);

    await form.getByRole('textbox', 'Time in').fill(timeIn);
    await form.getByRole('textbox', 'Time out').fill(timeOut);

    if (overtime) await form.getByRole('textbox', 'Approved overtime (hours)').fill(overtime);
    await form.getByRole('button', 'Save day').tap();
    await expect(form).toBeHidden();
  }
}

async function addHoliday(screen: Screen, date: string, name: string, kind: 'Regular holiday' | 'Special non-working day') {
  const form = screen.getByRole('form', 'Add a holiday');

  await form.getByRole('textbox', 'Date').fill(date);
  await form.getByRole('textbox', 'Holiday').fill(name);
  await form.getByRole('combobox', 'Kind').tap();
  await screen.getByRole('option', kind).tap();
  await form.getByRole('button', 'Add holiday').tap();
}

/** Where the column headed `name` ends on the right, and where the sheet's paper does, as drawn on screen. */
async function rightEdges(sheet: Locator, name: string) {
  const column = await sheet.getByRole('columnheader', name).boundingBox();
  const paper = await sheet.boundingBox();

  return { column: column ? column.x + column.width : Infinity, paper: paper ? paper.x + paper.width : 0 };
}

test('HR sets each employee\'s own pay, and it needs a daily rate', async ({ app, screen }) => {
  await app.open('/#payroll');
  await expect(screen.getByText('No employee has a pay setup yet, so there is no payroll to run.')).toBeVisible();

  const form = await openJuansPay(screen);

  await form.getByRole('button', 'Save pay setup').tap();
  await expect(form.getByRole('alert')).toHaveText('Enter Juan Miguel P. Reyes\'s daily rate.');

  await fillPay(form, { ...JUAN, SSS: '450' });
  await expect(screen.getByRole('dialog', 'Pay setup saved for Juan Miguel P. Reyes.')).toBeVisible();

  const row = screen.getByRole('table', 'Pay setup').getByRole('row', /Juan Miguel P\. Reyes/);

  await expect(row.getByRole('cell', 'APGCO-0013')).toBeVisible();
  await expect(row.getByRole('cell', '₱760.00')).toBeVisible();
  await expect(row.getByRole('cell', '₱1,000.00 + ₱150.00 a day')).toBeVisible();
  // His own SSS of 450, and the tables' PhilHealth (206.62 for the 16th to the 31st) and Pag-IBIG (100).
  await expect(row.getByRole('cell', '₱756.62')).toBeVisible();
  await expect(row.getByRole('cell', 'Cash')).toBeVisible();
});

test('edits pay from the row menu, refuses a rate it cannot read and an employee number in use, and shows how each is paid', async ({ app, screen }) => {
  await app.open('/#payroll');
  const setups = screen.getByRole('table', 'Pay setup');

  // Cancel saves nothing.
  await setups.getByRole('button', 'Actions for E-001').tap();
  await screen.getByRole('menuitem', 'Edit pay…').tap();
  let form = screen.getByRole('form', 'Pay setup for Juan Miguel P. Reyes');

  await form.getByRole('textbox', 'Daily rate').fill('760');
  await form.getByRole('button', 'Cancel').tap();
  await expect(form).toBeHidden();
  await expect(setups.getByRole('row', /Juan Miguel P\. Reyes/).getByRole('cell', 'Not set up')).toBeVisible();

  form = await openJuansPay(screen);
  await form.getByRole('textbox', 'Daily rate').fill('seven hundred');
  await form.getByRole('button', 'Save pay setup').tap();
  await expect(form.getByRole('alert')).toHaveText('Enter the daily rate as an amount in pesos.');

  await fillPay(form, { ...JUAN, Bank: 'BDO', 'Account no.': '0012-3456-7890' });
  await expect(setups.getByRole('row', /Juan Miguel P\. Reyes/).getByRole('cell', 'BDO')).toBeVisible();

  // His payslip names the bank and the account, under their labels in capitals.
  await screen.getByRole('group', 'Show').getByRole('button', 'Payslip: Juan Miguel P. Reyes').tap();
  const slip = screen.getByRole('article', 'Payslip, Juan Miguel P. Reyes, Oct 16–31, 2026');

  await expect(slip).toContainText('BANK BDO');
  await expect(slip).toContainText('ACCOUNT NO. 0012-3456-7890');

  // Two employees cannot share a number.
  await setups.getByRole('row', /Angelica S\. Bautista/).tap();
  form = screen.getByRole('form', 'Pay setup for Angelica S. Bautista');
  const employeeNo = form.getByRole('textbox', 'Employee no.');

  await employeeNo.fill('APGCO-0013');
  await form.getByRole('textbox', 'Daily rate').fill('900');
  await form.getByRole('button', 'Save pay setup').tap();
  await expect(form.getByRole('alert')).toHaveText('APGCO-0013 is already the employee number of Juan Miguel P. Reyes.');

  // Anyone without a bank is paid in cash.
  await employeeNo.fill('APGCO-0021');
  await form.getByRole('button', 'Save pay setup').tap();
  await expect(form).toBeHidden();
  await expect(setups.getByRole('row', /Angelica S\. Bautista/).getByRole('cell', 'Cash')).toBeVisible();
});

test('takes an employee off the payroll only after asking, and a closed cut-off keeps their pay', async ({ app, screen }) => {
  await app.open('/#timekeeping');
  await recordDays(screen, [[/^Fri · Oct 30 /, 'Oct 30, 2026', '08:00', '17:00']]);
  await app.open('/#payroll');
  const setups = screen.getByRole('table', 'Pay setup');

  // There is nothing to take off before a pay setup.
  await setups.getByRole('button', 'Actions for E-001').tap();
  await expect(screen.getByRole('menuitem', 'Take off payroll…')).toBeDisabled();
  await screen.getByRole('menuitem', 'Edit pay…').tap();
  await fillPay(screen.getByRole('form', 'Pay setup for Juan Miguel P. Reyes'), JUAN);
  await screen.getByRole('button', 'Close cut-off').tap();
  await expect(screen.getByText('Oct 16–31, 2026: 1 employee, ₱1,190.88 net, closed.')).toBeVisible();

  await setups.getByRole('button', 'Actions for E-001').tap();
  await screen.getByRole('menuitem', 'Take off payroll…').tap();
  await screen.getByRole('alertdialog', 'Take Juan Miguel P. Reyes off the payroll?').getByRole('button', 'Take off payroll').tap();
  await expect(screen.getByRole('dialog', 'Juan Miguel P. Reyes taken off the payroll. Closed cut-offs keep their pay.')).toBeVisible();
  await expect(setups.getByRole('row', /Juan Miguel P\. Reyes/).getByRole('cell', 'Not set up')).toBeVisible();

  // The closed cut-off still pays him what it did.
  await expect(screen.getByRole('table', 'Cut-off').getByRole('row', /^Juan Miguel P\. Reyes 1\/11 /)).toBeVisible();
  await expect(screen.getByText('Oct 16–31, 2026: 1 employee, ₱1,190.88 net, closed.')).toBeVisible();

  await app.open('/#home');
  await expect(screen.getByRole('button', /^Payroll /)).toContainText('On payroll 0');

  await app.open('/#activity');
  await screen.getByRole('group', 'Module').getByRole('button', 'Payroll').tap();
  const entries = screen.getByRole('region', 'Entries').getByRole('listitem');

  await expect(entries).toHaveCount(3);
  await expect(entries).toContainText([
    'PAY Juan Miguel P. Reyes taken off the payroll. Closed cut-offs keep their pay.',
    'PAY Payroll for Oct 16–31, 2026 closed: 1 employee, ₱1,190.88 net.',
    'PAY Pay set up for Juan Miguel P. Reyes: ₱760.00 a day.',
  ]);
});

test('refuses to close a cut-off with no one on it or before it ends, and sets up pay from the empty cut-off', async ({ app, screen }) => {
  await app.open('/#payroll');
  const cutoff = screen.getByRole('table', 'Cut-off');

  await screen.getByRole('button', 'Close cut-off').tap();
  await expect(screen.getByRole('dialog', 'Set up pay for at least one employee first.')).toBeVisible();

  await expect(screen.getByText('No one has a pay setup yet.')).toBeVisible();
  await screen.getByRole('button', 'Set up pay').tap();
  await fillPay(screen.getByRole('form', 'Pay setup for Juan Miguel P. Reyes'), JUAN);
  await expect(cutoff.getByRole('row', /^Juan Miguel P\. Reyes 0\/11 /)).toBeVisible();

  // The cut-off today falls in cannot be closed yet.
  await screen.getByRole('combobox', 'Cut-off').tap();
  await screen.getByRole('option', 'Nov 1–15, 2026').tap();
  await screen.getByRole('button', 'Close cut-off').tap();
  await expect(screen.getByRole('dialog', 'The Nov 1–15, 2026 cut-off ends Nov 15, 2026; close it from Nov 16, 2026.')).toBeVisible();

  // Still open: no day worked yet, so the ₱1,000 incentive less the first half's shares (412.50 + 206.63 + 100).
  await expect(screen.getByText('Nov 1–15, 2026: 1 employee, ₱280.87 net so far.')).toBeVisible();
});

test('shows the payroll sheet or one payslip, the sheet on a landscape A4 with every column on the paper, and saves it as a PDF', async ({ app, screen, browser }) => {
  await app.open('/#payroll');
  await fillPay(await openJuansPay(screen), JUAN);
  const show = screen.getByRole('group', 'Show');

  await expect(show.getByRole('button', 'Payroll sheet')).toHaveAttribute('aria-pressed', 'true');
  await show.getByRole('button', 'Payslip: Juan Miguel P. Reyes').tap();
  await expect(screen.getByRole('article', 'Payslip, Juan Miguel P. Reyes, Oct 16–31, 2026')).toBeVisible();
  await expect(screen.getByRole('article', 'Payroll sheet, Oct 16–31, 2026')).toBeHidden();
  // Its labels included, nothing on either paper is smaller than 11px.
  expect(await tinyPaperText(browser)).toEqual([]);

  await show.getByRole('button', 'Payroll sheet').tap();
  const sheet = screen.getByRole('article', 'Payroll sheet, Oct 16–31, 2026');

  await expect(sheet).toBeVisible();
  expect(await tinyPaperText(browser)).toEqual([]);

  // 22 columns, wider than the paper even on its side: the table shrinks to fit across it, out to the last two.
  await expect(sheet).toHaveAttribute('data-print-orientation', 'landscape');

  for (const name of ['Net pay', 'Signature']) {
    await expect(sheet.getByRole('columnheader', name)).toBeVisible();
    const { column, paper } = await rightEdges(sheet, name);

    expect(column).toBeLessThanOrEqual(paper);
  }

  // The toast shows for 3.2 s and the download can finish later, so it is read while the download is awaited. Drawing
  // the sheet into a PDF takes several seconds on a busy machine.
  const file = await browser.waitForDownload(async () => {
    await screen.getByRole('button', 'Export PDF').tap();
    await expect(screen.getByRole('dialog', 'Saved Payroll Oct 16–31, 2026.pdf.')).toBeVisible({ timeout: 20_000 });
  });

  expect(file.suggestedFilename).toBe('Payroll Oct 16–31, 2026.pdf');

  // The same paper, on an A4 page turned on its side: 842 × 595 pt.
  const page = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(await readFile(file.absolutePath, 'latin1'));

  expect(Number(page?.[1])).toBeCloseTo(841.89, 1);
  expect(Number(page?.[2])).toBeCloseTo(595.28, 1);
});

// 1100 px is Keystone's narrowest window. The cut-off cannot show all nine columns whole there, so it keeps Gross,
// Deductions and Net pay and leaves what adds up to Gross to the payroll sheet below, until the window has room.
test('keeps every figure of the cut-off whole in a narrow window, and shows its breakdown once there is room', async ({ app, screen, browser }) => {
  await browser.setViewport({ width: 1100, height: 800 });
  await app.open('/#payroll');
  await fillPay(await openJuansPay(screen), JUAN);
  const cutoff = screen.getByRole('table', 'Cut-off');

  await expect(cutoff.getByRole('row', 'Juan Miguel P. Reyes 0/11 ₱1,000.00 -₱719.12 ₱280.88')).toBeVisible();
  await expect(cutoff.getByRole('columnheader', 'Compensation')).toBeHidden();

  // Net pay ends inside the panel, where its Close cut-off button does, not past its edge.
  const netPay = await cutoff.getByRole('columnheader', 'Net pay').boundingBox();
  const panelEdge = await screen.getByRole('button', 'Close cut-off').boundingBox();

  expect((netPay?.x ?? 0) + (netPay?.width ?? Infinity)).toBeLessThanOrEqual((panelEdge?.x ?? 0) + (panelEdge?.width ?? 0));

  // Nothing but a long name is cut short with an ellipsis.
  const cutShort = await browser.evaluate(() => [...document.querySelectorAll<HTMLTableCellElement>('table[aria-label="Cut-off"] :is(th, td)')]
    .flatMap((c) => (c.cellIndex > 0 && c.scrollWidth > c.clientWidth ? [c.textContent] : [])));

  expect(cutShort).toEqual([]);

  await browser.setViewport({ width: 1440, height: 900 });
  await expect(cutoff.getByRole('row', 'Juan Miguel P. Reyes 0/11 ₱0.00 ₱1,000.00 ₱0.00 ₱0.00 ₱1,000.00 -₱719.12 ₱280.88')).toBeVisible();
});

test('closes and reopens a cut-off, and Overview and the Activity Log follow', async ({ app, screen }) => {
  await app.open('/#overview');
  await expect(screen.getByRole('definition').filter({ hasText: 'No cut-off closed yet' })).toBeVisible();

  await app.open('/#timekeeping');
  await recordDays(screen, [[/^Fri · Oct 30 /, 'Oct 30, 2026', '08:00', '17:00']]);
  await app.open('/#payroll');
  await fillPay(await openJuansPay(screen), JUAN);
  await screen.getByRole('button', 'Close cut-off').tap();
  await expect(screen.getByRole('dialog', 'Payroll for Oct 16–31, 2026 closed: 1 employee, ₱1,190.88 net.')).toBeVisible();

  // Overview's last payroll is the one just closed.
  await app.open('/#overview');
  await expect(screen.getByRole('definition').filter({ hasText: '₱1,190.88' })).toBeVisible();
  await expect(screen.getByRole('definition').filter({ hasText: 'Oct 16–31, 2026 · 1 employee' })).toBeVisible();

  await app.open('/#payroll');
  await screen.getByRole('button', 'Reopen cut-off').tap();
  await screen.getByRole('alertdialog', 'Reopen Oct 16–31, 2026?').getByRole('button', 'Reopen cut-off').tap();
  await expect(screen.getByRole('dialog', 'Payroll for Oct 16–31, 2026 reopened; it follows timekeeping and the pay setups again.')).toBeVisible();

  await app.open('/#overview');
  await expect(screen.getByRole('definition').filter({ hasText: 'No cut-off closed yet' })).toBeVisible();

  await app.open('/#activity');
  await screen.getByRole('group', 'Module').getByRole('button', 'Payroll').tap();
  const entries = screen.getByRole('region', 'Entries').getByRole('listitem');

  await expect(entries).toHaveCount(3);
  await expect(entries).toContainText([
    'PAY Payroll for Oct 16–31, 2026 reopened; it follows timekeeping and the pay setups again.',
    'PAY Payroll for Oct 16–31, 2026 closed: 1 employee, ₱1,190.88 net.',
    'PAY Pay set up for Juan Miguel P. Reyes: ₱760.00 a day.',
  ]);
});

test('works out the monthly pay and the shares from the tables, and takes the employee\'s own instead', async ({ app, screen }) => {
  await app.open('/#payroll');
  let form = await openJuansPay(screen);

  // Empty fields show what they will be, in grey: 760 × 261 ÷ 12, and the tables on it, for the 16th to the 31st.
  await form.getByRole('textbox', 'Daily rate').fill('760');
  await expect(form.getByRole('textbox', 'Monthly pay basis')).toHaveAttribute('placeholder', '16530.00');
  await expect(form.getByRole('textbox', 'SSS')).toHaveAttribute('placeholder', '412.50');
  await expect(form.getByRole('textbox', 'PhilHealth')).toHaveAttribute('placeholder', '206.62');
  await expect(form.getByRole('textbox', 'Pag-IBIG')).toHaveAttribute('placeholder', '100.00');

  // Her own monthly pay moves every table share: SSS 5% of 25,000, PhilHealth 2.5%, Pag-IBIG at its cap; half each.
  await form.getByRole('textbox', 'Monthly pay basis').fill('25000');
  await expect(form.getByRole('textbox', 'SSS')).toHaveAttribute('placeholder', '625.00');
  await expect(form.getByRole('textbox', 'PhilHealth')).toHaveAttribute('placeholder', '312.50');
  await form.getByRole('button', 'Save pay setup').tap();

  const deductions = () => screen.getByRole('table', 'Pay setup').getByRole('row', /Juan Miguel P\. Reyes/).getByRole('cell', /^₱[\d,]+\.\d\d$/).last();

  await expect(deductions()).toHaveText('₱1,037.50');

  // His own SSS replaces the table's; the others stay on the tables.
  form = await openJuansPay(screen);
  await fillPay(form, { SSS: '450' });
  await expect(deductions()).toHaveText('₱862.50');

  // Clearing the monthly pay puts the other shares back on 760 × 261 ÷ 12.
  form = await openJuansPay(screen);
  await fillPay(form, { 'Monthly pay basis': '' });
  await expect(deductions()).toHaveText('₱756.62');
});

test('prices the regression cut-off from Timekeeping, closes it, and prints the payslip', async ({ app, screen, browser }) => {
  // Wide enough for the cut-off to show its breakdown of gross beside it.
  await browser.setViewport({ width: 1440, height: 900 });
  await app.open('/#timekeeping');
  await addHoliday(screen, '2026-10-29', 'Special day', 'Special non-working day');
  await addHoliday(screen, '2026-10-30', 'Regular day', 'Regular holiday');
  await recordDays(screen, [
    [/^Fri · Oct 16 /, 'Oct 16, 2026', '07:58', '17:00'],
    [/^Mon · Oct 19 /, 'Oct 19, 2026', '08:12', '17:00'],
    [/^Tue · Oct 20 /, 'Oct 20, 2026', '08:05', '17:00'],
    [/^Wed · Oct 21 /, 'Oct 21, 2026', '08:00', '19:00', '2'],
    [/^Thu · Oct 22 /, 'Oct 22, 2026', '12:30', '17:00'],
    [/^Mon · Oct 26 /, 'Oct 26, 2026', '07:50', '16:30'],
    [/^Tue · Oct 27 /, 'Oct 27, 2026', '08:20', '17:00'],
    [/^Wed · Oct 28 /, 'Oct 28, 2026', '08:10', '17:00'],
    [/^Thu · Oct 29 /, 'Oct 29, 2026', '08:00', '17:00'],
  ]);
  await expect(screen.getByText(/^9 of 11 working days worked so far · 1 absence · 1 half day · 55 min late or undertime · 2 hr approved overtime\./)).toBeVisible();

  await app.open('/#payroll');
  await fillPay(await openJuansPay(screen), JUAN);

  // Days · compensation · allowances · late and half day · overtime · gross · deductions · net.
  const cutoff = screen.getByRole('table', 'Cut-off');

  await expect(cutoff.getByRole('row', 'Juan Miguel P. Reyes 10/11 ₱7,828.00 ₱2,350.00 -₱467.08 ₱237.50 ₱9,948.42 -₱719.12 ₱9,229.30')).toBeVisible();
  await expect(screen.getByText('Oct 16–31, 2026: 1 employee, ₱9,229.30 net so far.')).toBeVisible();

  const sheet = screen.getByRole('article', 'Payroll sheet, Oct 16–31, 2026');

  await expect(sheet).toContainText('APGCO-0013');
  await expect(sheet).toContainText('9,948.42');
  await expect(sheet).toContainText('9,229.30');

  await screen.getByRole('button', 'Close cut-off').tap();
  await expect(screen.getByRole('dialog', 'Payroll for Oct 16–31, 2026 closed: 1 employee, ₱9,229.30 net.')).toBeVisible();
  await expect(screen.getByText('Oct 16–31, 2026: 1 employee, ₱9,229.30 net, closed.')).toBeVisible();

  // The payslip shows late and the half day under deductions, and comes to the same net pay. Its totals' labels are
  // in capitals, on their gold bands.
  await cutoff.getByRole('row', /^Juan Miguel P\. Reyes /).tap();
  const slip = screen.getByRole('article', 'Payslip, Juan Miguel P. Reyes, Oct 16–31, 2026');

  await expect(slip).toContainText('TOTAL EARNINGS ₱10,415.50');
  await expect(slip).toContainText('TOTAL DEDUCTIONS ₱1,186.20');
  await expect(slip).toContainText('Late / undertime 87.08');
  await expect(slip).toContainText('Half day 380.00');
  await expect(slip).toContainText('₱9,229.30');

  await app.open('/#overview');
  await expect(screen.getByRole('definition').filter({ hasText: '₱9,229.30' })).toBeVisible();
});

test('keeps a closed cut-off as it was when Timekeeping is corrected later, and reprices it once reopened', async ({ app, screen }) => {
  await app.open('/#timekeeping');
  await recordDays(screen, [[/^Fri · Oct 30 /, 'Oct 30, 2026', '08:00', '17:00']]);
  await app.open('/#payroll');
  await fillPay(await openJuansPay(screen), JUAN);

  // One day: 760 + 1,000 + 150 = 1,910 gross, less the tables' 719.12.
  await screen.getByRole('button', 'Close cut-off').tap();
  await expect(screen.getByText('Oct 16–31, 2026: 1 employee, ₱1,190.88 net, closed.')).toBeVisible();

  // A forgotten day is added in Timekeeping after the cut-off was closed.
  await app.open('/#timekeeping');
  await recordDays(screen, [[/^Thu · Oct 29 /, 'Oct 29, 2026', '08:00', '17:00']]);
  await app.open('/#payroll');
  await expect(screen.getByRole('table', 'Cut-off').getByRole('row', /^Juan Miguel P\. Reyes 1\/11 /)).toBeVisible();
  await expect(screen.getByText('Oct 16–31, 2026: 1 employee, ₱1,190.88 net, closed.')).toBeVisible();

  await screen.getByRole('button', 'Reopen cut-off').tap();
  await screen.getByRole('alertdialog', 'Reopen Oct 16–31, 2026?').getByRole('button', 'Reopen cut-off').tap();

  // Two days now: 1,520 + 1,000 + 300 = 2,820 gross, less 719.12.
  await expect(screen.getByRole('table', 'Cut-off').getByRole('row', /^Juan Miguel P\. Reyes 2\/11 /)).toBeVisible();
  await expect(screen.getByText('Oct 16–31, 2026: 1 employee, ₱2,100.88 net so far.')).toBeVisible();
});

test('shows on Home how many employees are on the payroll', async ({ app, screen }) => {
  await app.open('/#payroll');
  await fillPay(await openJuansPay(screen), JUAN);

  await app.open('/#home');
  await expect(screen.getByRole('button', /^Payroll /)).toContainText('On payroll 1');
});
