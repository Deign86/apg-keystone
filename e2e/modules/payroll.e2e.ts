import { test } from '@e2e-dev/web';
import { expect, type Locator, type Screen } from 'e2e';

// Payroll (packages/modules/payroll). The clock starts at 10:00 on Monday, Nov 2, 2026, so the cut-off to close is
// Oct 16–31, 2026 (11 standard working days). The sample data has four employees and no pay setups.

/** Fills in the rates HR keeps for Juan Miguel P. Reyes and saves them. */
async function fillJuansPay(form: Locator) {
  await form.getByRole('textbox', 'Employee no.').fill('APGCO-0013');
  await form.getByRole('textbox', 'Daily rate').fill('760');
  await form.getByRole('textbox', 'Incentives allowance').fill('1000');
  await form.getByRole('textbox', 'Special allowance').fill('150');
  await form.getByRole('textbox', 'SSS').fill('450');
  await form.getByRole('button', 'Save pay setup').tap();
}

/** Opens Juan Miguel P. Reyes's pay setup from the list and saves it. */
async function setJuansPay(screen: Screen) {
  await screen.getByRole('table', 'Pay setup').getByRole('row', /Juan Miguel P\. Reyes/).tap();
  await fillJuansPay(screen.getByRole('form', 'Pay setup for Juan Miguel P. Reyes'));
}

test('HR sets each employee\'s own pay, and it needs a daily rate', async ({ app, screen }) => {
  await app.open('/#payroll');
  await expect(screen.getByText('No employee has a pay setup yet, so there is no payroll to run.')).toBeVisible();

  await screen.getByRole('table', 'Pay setup').getByRole('row', /Juan Miguel P\. Reyes/).tap();
  const form = screen.getByRole('form', 'Pay setup for Juan Miguel P. Reyes');

  await form.getByRole('button', 'Save pay setup').tap();
  await expect(form.getByRole('alert')).toHaveText('Enter Juan Miguel P. Reyes\'s daily rate.');

  await fillJuansPay(form);
  await expect(screen.getByRole('dialog', 'Pay setup saved for Juan Miguel P. Reyes.')).toBeVisible();

  const row = screen.getByRole('table', 'Pay setup').getByRole('row', /Juan Miguel P\. Reyes/);

  await expect(row.getByRole('cell', 'APGCO-0013')).toBeVisible();
  await expect(row.getByRole('cell', '₱760.00')).toBeVisible();
  await expect(row.getByRole('cell', '₱1,000.00 + ₱150.00 a day')).toBeVisible();
  await expect(row.getByRole('cell', '₱450.00')).toBeVisible();
  await expect(row.getByRole('cell', 'Cash')).toBeVisible();
});

test('prices the cut-off from Timekeeping, closes it, and prints the payslip', async ({ app, screen }) => {
  // Two days in Timekeeping: Thursday 30 minutes late, Friday on time.
  await app.open('/#timekeeping');
  await screen.getByRole('combobox', 'Cut-off').tap();
  await screen.getByRole('option', 'Oct 16–31, 2026').tap();

  for (const [row, label, timeIn] of [[/^Thu · Oct 29 /, 'Correct Oct 29, 2026', '08:30'], [/^Fri · Oct 30 /, 'Correct Oct 30, 2026', '07:55']] as const) {
    await screen.getByRole('table', 'Daily time record').getByRole('row', row).tap();
    const form = screen.getByRole('form', label);

    await form.getByRole('textbox', 'Time in').fill(timeIn);
    await form.getByRole('textbox', 'Time out').fill('17:00');
    await form.getByRole('button', 'Save day').tap();
  }

  await app.open('/#payroll');
  await setJuansPay(screen);

  // 760 × 2 days; 1,000 + 150 × 2 allowances; 30 minutes late at 760 / 480 a minute; 450 SSS.
  const cutoff = screen.getByRole('table', 'Cut-off');

  await expect(cutoff.getByRole('row', 'Juan Miguel P. Reyes 2/11 ₱1,520.00 ₱1,300.00 -₱47.50 ₱0.00 ₱2,772.50 -₱450.00 ₱2,322.50')).toBeVisible();
  await expect(screen.getByText('Oct 16–31, 2026: 1 employee, ₱2,322.50 net so far.')).toBeVisible();

  await screen.getByRole('button', 'Close cut-off').tap();
  await expect(screen.getByRole('dialog', 'Payroll for Oct 16–31, 2026 closed: 1 employee, ₱2,322.50 net.')).toBeVisible();
  await expect(screen.getByText('Oct 16–31, 2026: 1 employee, ₱2,322.50 net, closed.')).toBeVisible();
  await expect(screen.getByRole('button', 'Reopen cut-off')).toBeVisible();

  const sheet = screen.getByRole('article', 'Payroll sheet, Oct 16–31, 2026');

  await expect(sheet).toContainText('APGCO-0013');
  await expect(sheet).toContainText('2,322.50');

  await cutoff.getByRole('row', /^Juan Miguel P\. Reyes /).tap();
  const slip = screen.getByRole('article', 'Payslip, Juan Miguel P. Reyes, Oct 16–31, 2026');

  await expect(slip).toContainText('Total earnings ₱2,820.00');
  await expect(slip).toContainText('Total deductions ₱497.50');
  await expect(slip).toContainText('₱2,322.50');

  await app.open('/#overview');
  await expect(screen.getByRole('definition').filter({ hasText: 'Oct 16–31, 2026 · 1 employee' })).toBeVisible();
});

test('shows on Home how many employees are on the payroll', async ({ app, screen }) => {
  await app.open('/#payroll');
  await setJuansPay(screen);

  await app.open('/#home');
  await expect(screen.getByRole('button', /^Payroll /)).toContainText('On payroll 1');
});
