import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Overview (packages/modules/overview). It shows only what the other screens contribute (figures, findings, waiting
// items, "New …" buttons), so these tests also guard the contributions of Vouchers, Billing, Directory, Timekeeping and
// Payroll. The ID Maker is no longer installed (docs/adr/0046): nothing of it shows here, though its IDs stay saved.

test('sums up the figures from every screen', async ({ app, screen }) => {
  await app.open('/#overview');

  await expect(screen.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
  await expect(screen.getByText('₱91,000.00 from Dela Cruz, Maria Teresa has been overdue since Oct 10, 2026.')).toBeVisible();
  await expect(screen.getByRole('definition').filter({ hasText: '₱35,000.00 pending signature' })).toBeVisible();
  await expect(screen.getByRole('definition').filter({ hasText: '2 statements open · 1 overdue' })).toBeVisible();
  await expect(screen.getByRole('definition').filter({ hasText: '4 vendors · 3 clients · 4 employees' })).toBeVisible();
  await expect(screen.getByRole('definition').filter({ hasText: 'queued for printing' })).toBeHidden();
});

test('lists what waits on you, and opens each one in its own screen', async ({ app, screen }) => {
  // Home's Overview tile counts the same items: the sample's voucher for approval and its two open statements. Its ID
  // card for printing waited in the ID Maker, which is no longer installed (docs/adr/0046).
  await app.open('/#home');
  await expect(screen.getByRole('button', /^Overview /)).toContainText('Waiting on you 3');

  await app.open('/#overview');
  const waiting = screen.getByRole('region', 'Waiting on you');

  await expect(waiting.getByRole('listitem')).toHaveCount(3);
  await waiting.getByRole('button', 'CV-2026-0141 Vergara & Associates Law Office · voucher ₱35,000.00 For Approval').tap();

  await expect(screen.getByRole('heading', { name: 'Check Vouchers', level: 1 })).toBeVisible();
  await expect(screen.getByRole('form', 'Editing CV-2026-0141')).toBeVisible();
});

test('starts a new document from its button', async ({ app, screen }) => {
  await app.open('/#overview');
  await screen.getByRole('button', 'New statement').tap();

  await expect(screen.getByRole('heading', { name: 'Billing Statements', level: 1 })).toBeVisible();
  await expect(screen.getByRole('form', 'New statement')).toBeVisible();
});

test('follows new work: an approved voucher leaves the waiting list', async ({ app, screen }) => {
  await app.open('/#vouchers');
  await screen.getByRole('button', 'Actions for CV-2026-0141').tap();
  await screen.getByRole('menuitem', 'Mark approved').tap();
  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^CV-2026-0141 /).getByRole('cell', 'Approved')).toBeVisible();

  await app.open('/#overview');
  const waiting = screen.getByRole('region', 'Waiting on you');

  // The three the sample starts with, less the voucher approved.
  await expect(waiting.getByRole('listitem')).toHaveCount(2);
  await expect(waiting.getByRole('button', /^CV-2026-0141 /)).toBeHidden();
});

test('shows recent activity and opens the full log', async ({ app, screen }) => {
  await app.open('/#overview');
  const recent = screen.getByRole('region', 'Recent activity');

  await expect(recent.getByRole('listitem').first()).toContainText('CV-2026-0141');
  await recent.getByRole('button', 'View all').tap();

  await expect(screen.getByRole('heading', { name: 'Activity Log', level: 1 })).toBeVisible();
});

test('starts a check voucher from its button, putting away what was open', async ({ app, screen }) => {
  await app.open('/#vouchers');
  await screen.getByRole('table', 'Voucher register').getByRole('cell', 'CV-2026-0141').tap();
  await expect(screen.getByRole('form', 'Editing CV-2026-0141')).toBeVisible();

  // A form keeps its draft across screens, so only the button puts CV-2026-0141 away.
  await app.open('/#overview');
  await screen.getByRole('button', 'New check voucher').tap();

  await expect(screen.getByRole('heading', { name: 'Check Vouchers', level: 1 })).toBeVisible();
  await expect(screen.getByRole('form', 'New voucher').getByRole('textbox', 'CV No.')).toHaveValue('888-001');

  // The ID Maker, which had a "New ID" button here, is no longer installed (docs/adr/0046).
  await app.open('/#overview');
  await expect(screen.getByRole('button', 'New check voucher')).toBeVisible();
  await expect(screen.getByRole('button', 'New ID')).toBeHidden();
});

test('opens a statement from what waits on you', async ({ app, screen }) => {
  await app.open('/#overview');
  const waiting = screen.getByRole('region', 'Waiting on you');

  await waiting.getByRole('button', '010098-2026 Dela Cruz, Maria Teresa · due Oct 10, 2026 ₱91,000.00 Overdue').tap();

  await expect(screen.getByRole('heading', { name: 'Billing Statements', level: 1 })).toBeVisible();
  await expect(screen.getByRole('form', 'Editing 010098-2026')).toBeVisible();
});

test('says nothing is waiting once every voucher and statement is dealt with', async ({ app, screen }) => {
  await app.open('/#vouchers');
  await screen.getByRole('button', 'Actions for CV-2026-0141').tap();
  await screen.getByRole('menuitem', 'Mark approved').tap();
  await expect(screen.getByRole('table', 'Voucher register').getByRole('row', /^CV-2026-0141 /).getByRole('cell', 'Approved')).toBeVisible();

  await app.open('/#billing');

  for (const no of ['010098-2026', '010099-2026']) {
    await screen.getByRole('button', `Actions for ${no}`).tap();
    await screen.getByRole('menuitem', 'Mark paid').tap();
    await expect(screen.getByRole('table', 'Statements issued').getByRole('row', new RegExp(`^${no} `)).getByRole('cell', 'Paid')).toBeVisible();
  }

  await app.open('/#overview');
  const waiting = screen.getByRole('region', 'Waiting on you');

  await expect(waiting.getByRole('listitem')).toHaveCount(0);
  await expect(waiting.getByText('Nothing is waiting on you.')).toBeVisible();
  // With no finding left, the line under the title says the same.
  await expect(screen.getByText('Nothing is waiting on you.')).toHaveCount(2);
  await expect(screen.getByRole('definition').filter({ hasText: '₱0.00 pending signature' })).toBeVisible();
  await expect(screen.getByRole('definition').filter({ hasText: '0 statements open · 0 overdue' })).toBeVisible();

  await app.open('/');
  await expect(screen.getByText('Nothing is waiting on you.')).toBeVisible();
  await expect(screen.getByRole('button', /^Overview /)).toContainText('Waiting on you 0');
});

test('shows who is in today and the last payroll among the figures', async ({ app, screen }) => {
  await app.open('/#overview');

  await expect(screen.getByRole('term').filter({ hasText: 'Employees in today' })).toBeVisible();
  await expect(screen.getByRole('definition').filter({ hasText: '0 of 4' })).toBeVisible();
  await expect(screen.getByRole('definition').filter({ hasText: '0 late' })).toBeVisible();
  await expect(screen.getByRole('term').filter({ hasText: 'Last payroll' })).toBeVisible();
  await expect(screen.getByRole('definition').filter({ hasText: 'No cut-off closed yet' })).toBeVisible();

  // The clock starts at 10:00, so anyone timed in now is late.
  await app.open('/#timekeeping');
  await screen.getByRole('table', 'Today').getByRole('button', 'Time in Angelica S. Bautista').tap();
  await expect(screen.getByText(/^1 of 4 employees timed in today\./)).toBeVisible();

  await app.open('/#overview');
  await expect(screen.getByRole('definition').filter({ hasText: '1 of 4' })).toBeVisible();
  await expect(screen.getByRole('definition').filter({ hasText: '1 late' })).toBeVisible();
});
