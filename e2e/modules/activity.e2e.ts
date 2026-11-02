import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Activity Log (packages/modules/activity): every entry, newest first, filtered by the screen that wrote it (each
// screen contributes its log tags) and searched. The sample data has 6 entries.

test('lists every entry, newest first', async ({ app, screen }) => {
  await app.open('/#activity');
  const entries = screen.getByRole('region', 'Entries').getByRole('listitem');

  await expect(screen.getByText('6 entries. The last was on Oct 26, 2026.')).toBeVisible();
  await expect(entries).toHaveCount(6);
  await expect(entries.first()).toContainText('CV CV-2026-0141 for Vergara & Associates Law Office saved and routed for approval');
  await expect(entries.last()).toContainText('ID APG-2026-0030 issued to Rafael D. Mendoza');
});

test('filters by the screen that wrote the entry', async ({ app, screen }) => {
  await app.open('/#activity');
  const filters = screen.getByRole('group', 'Module');
  const entries = screen.getByRole('region', 'Entries').getByRole('listitem');

  await filters.getByRole('button', 'Billing').tap();
  await expect(entries).toHaveCount(2);
  await expect(entries.first()).toContainText('BS 010099-2026');

  await filters.getByRole('button', 'IDs').tap();
  await expect(entries).toHaveCount(1);

  await filters.getByRole('button', 'All').tap();
  await expect(entries).toHaveCount(6);
});

test('searches the log', async ({ app, screen }) => {
  await app.open('/#activity');
  await screen.getByRole('textbox', 'Search the log').fill('Meralco');
  const entries = screen.getByRole('region', 'Entries').getByRole('listitem');

  await expect(entries).toHaveCount(1);
  await expect(entries.first()).toContainText('CV CV-2026-0139 released; check 0004509 picked up by Meralco collector.');
});
