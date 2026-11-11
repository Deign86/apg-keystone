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

test('shows one screen\'s entries, and says when a screen has written nothing yet', async ({ app, screen }) => {
  await app.open('/#activity');
  const filters = screen.getByRole('group', 'Module');
  const entries = screen.getByRole('region', 'Entries').getByRole('listitem');

  await filters.getByRole('button', 'Vouchers').tap();
  await expect(filters.getByRole('button', 'Vouchers')).toHaveAttribute('aria-pressed', 'true');
  await expect(entries).toHaveCount(3);
  await expect(entries).toContainText([
    'CV CV-2026-0141 for Vergara & Associates Law Office saved and routed for approval',
    'CV CV-2026-0140 approved by CEO.',
    'CV CV-2026-0139 released; check 0004509 picked up by Meralco collector.',
  ]);

  // The sample data has no Directory entries.
  await filters.getByRole('button', 'Directory').tap();
  await expect(entries).toHaveCount(0);
  await expect(screen.getByRole('region', 'Entries').getByText('No activity yet.')).toBeVisible();
});

test('says when a search matches nothing, and clears the search', async ({ app, screen }) => {
  await app.open('/#activity');
  const search = screen.getByRole('textbox', 'Search the log');
  const entries = screen.getByRole('region', 'Entries').getByRole('listitem');

  await search.fill('zzz');
  await expect(entries).toHaveCount(0);
  await expect(screen.getByText('Nothing matches “zzz”.')).toBeVisible();

  await screen.getByRole('region', 'Entries').getByRole('button', 'Clear search').tap();
  await expect(search).toHaveValue('');
  await expect(entries).toHaveCount(6);
});

test('searches the log', async ({ app, screen }) => {
  await app.open('/#activity');
  await screen.getByRole('textbox', 'Search the log').fill('Meralco');
  const entries = screen.getByRole('region', 'Entries').getByRole('listitem');

  await expect(entries).toHaveCount(1);
  await expect(entries.first()).toContainText('CV CV-2026-0139 released; check 0004509 picked up by Meralco collector.');
});
