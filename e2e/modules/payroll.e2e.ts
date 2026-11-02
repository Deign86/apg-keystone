import { test } from '@e2e-dev/web';
import { expect, type Locator, type Screen } from 'e2e';

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

test('prices the regression cut-off from Timekeeping, closes it, and prints the payslip', async ({ app, screen }) => {
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

  // The payslip shows late and the half day under deductions, and comes to the same net pay.
  await cutoff.getByRole('row', /^Juan Miguel P\. Reyes /).tap();
  const slip = screen.getByRole('article', 'Payslip, Juan Miguel P. Reyes, Oct 16–31, 2026');

  await expect(slip).toContainText('Total earnings ₱10,415.50');
  await expect(slip).toContainText('Total deductions ₱1,186.20');
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
