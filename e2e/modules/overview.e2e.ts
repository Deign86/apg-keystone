import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Overview (packages/modules/overview). It shows only what the other screens contribute (figures, findings, waiting
// items, "New …" buttons), so these tests also guard the contributions of Vouchers, Billing, ID Maker and Directory.

test('sums up the figures from every screen', async ({ app, screen }) => {
  await app.open('/#overview');

  await expect(screen.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
  await expect(screen.getByText('₱91,000.00 from Dela Cruz, Maria Teresa has been overdue since Oct 10, 2026.')).toBeVisible();
  await expect(screen.getByRole('definition').filter({ hasText: '₱35,000.00 pending signature' })).toBeVisible();
  await expect(screen.getByRole('definition').filter({ hasText: '2 statements open · 1 overdue' })).toBeVisible();
  await expect(screen.getByRole('definition').filter({ hasText: '1 queued for printing' })).toBeVisible();
  await expect(screen.getByRole('definition').filter({ hasText: '4 vendors · 3 clients · 4 employees' })).toBeVisible();
});

test('lists what waits on you, and opens each one in its own screen', async ({ app, screen }) => {
  await app.open('/#overview');
  const waiting = screen.getByRole('region', 'Waiting on you');

  await expect(waiting.getByRole('listitem')).toHaveCount(4);
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

  await expect(waiting.getByRole('listitem')).toHaveCount(3);
  await expect(waiting.getByRole('button', /^CV-2026-0141 /)).toBeHidden();
});

test('shows recent activity and opens the full log', async ({ app, screen }) => {
  await app.open('/#overview');
  const recent = screen.getByRole('region', 'Recent activity');

  await expect(recent.getByRole('listitem').first()).toContainText('CV-2026-0141');
  await recent.getByRole('button', 'View all').tap();

  await expect(screen.getByRole('heading', { name: 'Activity Log', level: 1 })).toBeVisible();
});
