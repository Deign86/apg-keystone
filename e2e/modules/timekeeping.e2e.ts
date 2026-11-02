import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Timekeeping (packages/modules/timekeeping). The clock starts at 10:00 on Monday, Nov 2, 2026, so anyone timed in
// now is two hours late. The sample data has four employees and no time records.

test('times an employee in from today\'s board, and Home counts them in', async ({ app, screen }) => {
  await app.open('/#timekeeping');
  await expect(screen.getByText(/^0 of 4 employees timed in today\. Not in yet: Juan Miguel P\. Reyes, /)).toBeVisible();
  const today = screen.getByRole('table', 'Today');

  await today.getByRole('button', 'Time in Angelica S. Bautista').tap();
  await expect(screen.getByRole('dialog', 'Angelica S. Bautista timed in at 10:00 AM, 2 hr late.')).toBeVisible();

  const row = today.getByRole('row', /^Angelica S\. Bautista /);

  await expect(row.getByRole('cell', '10:00 AM')).toBeVisible();
  await expect(row.getByRole('cell', 'Late 2 hr')).toBeVisible();
  await expect(row.getByRole('button', 'Time out Angelica S. Bautista')).toBeVisible();
  await expect(screen.getByText(/^1 of 4 employees timed in today\./)).toBeVisible();

  await app.open('/#home');
  await expect(screen.getByRole('button', /^Timekeeping /)).toContainText('1 of 4');
});

test('corrects past days, and gives the week\'s 15-minute grace to the earliest late arrival', async ({ app, screen }) => {
  await app.open('/#timekeeping');
  await screen.getByRole('combobox', 'Cut-off').tap();
  await screen.getByRole('option', 'Oct 16–31, 2026').tap();
  const record = screen.getByRole('table', 'Daily time record');

  // Friday: in at 8:10 uses the week's grace.
  await record.getByRole('row', /^Fri · Oct 30 /).tap();
  let form = screen.getByRole('form', 'Correct Oct 30, 2026');

  await form.getByRole('textbox', 'Time in').fill('08:10');
  await form.getByRole('textbox', 'Time out').fill('17:00');
  await form.getByRole('button', 'Save day').tap();
  await expect(record.getByRole('row', /^Fri · Oct 30 /).getByRole('cell', 'On time (grace)')).toBeVisible();

  // Thursday, earlier in the same week, at 8:05 and out at 4:30: the grace moves to Thursday, so Friday is late.
  await record.getByRole('row', /^Thu · Oct 29 /).tap();
  form = screen.getByRole('form', 'Correct Oct 29, 2026');
  await form.getByRole('textbox', 'Time in').fill('08:05');
  await form.getByRole('textbox', 'Time out').fill('16:30');
  await form.getByRole('button', 'Save day').tap();

  await expect(record.getByRole('row', /^Thu · Oct 29 /).getByRole('cell', 'On time (grace)')).toBeVisible();
  await expect(record.getByRole('row', /^Thu · Oct 29 /).getByRole('cell', '30 min undertime')).toBeVisible();
  await expect(record.getByRole('row', /^Fri · Oct 30 /).getByRole('cell', 'Late 10 min')).toBeVisible();
  await expect(screen.getByText(/^2 of 11 working days worked so far · 9 absences · 0 half days · 40 min late or undertime/)).toBeVisible();
});

test('refuses a time out before the time in', async ({ app, screen }) => {
  await app.open('/#timekeeping');
  await screen.getByRole('table', 'Daily time record').getByRole('row', /^Mon · Nov 2 /).tap();
  const form = screen.getByRole('form', 'Correct Nov 2, 2026');

  await form.getByRole('textbox', 'Time in').fill('09:00');
  await form.getByRole('textbox', 'Time out').fill('08:00');
  await form.getByRole('button', 'Save day').tap();
  await expect(form.getByRole('alert')).toHaveText('The time out must be after the time in.');
});

test('keeps the office\'s holidays', async ({ app, screen }) => {
  await app.open('/#timekeeping');
  const form = screen.getByRole('form', 'Add a holiday');

  await form.getByRole('textbox', 'Date').fill('2026-11-30');
  await form.getByRole('textbox', 'Holiday').fill('Bonifacio Day');
  await form.getByRole('button', 'Add holiday').tap();

  await expect(screen.getByRole('table', 'Holidays').getByRole('row', /^Nov 30, 2026 Bonifacio Day Regular holiday/)).toBeVisible();
  await app.open('/#activity');
  await screen.getByRole('group', 'Module').getByRole('button', 'Timekeeping').tap();
  const entries = screen.getByRole('region', 'Entries').getByRole('listitem');

  await expect(entries).toHaveCount(1);
  await expect(entries.first()).toContainText('DTR Nov 30, 2026 set as a regular holiday: Bonifacio Day.');
});

test('marks a half day, undertime and approved overtime in the daily time record', async ({ app, screen }) => {
  await app.open('/#timekeeping');
  await screen.getByRole('combobox', 'Cut-off').tap();
  await screen.getByRole('option', 'Oct 16–31, 2026').tap();
  const record = screen.getByRole('table', 'Daily time record');

  for (const [row, date, timeIn, timeOut, overtime] of [
    [/^Wed · Oct 21 /, 'Oct 21, 2026', '08:00', '19:00', '2'],
    [/^Thu · Oct 22 /, 'Oct 22, 2026', '12:30', '17:00', ''],
    [/^Mon · Oct 26 /, 'Oct 26, 2026', '07:50', '16:30', ''],
  ] as const) {
    await record.getByRole('row', row).tap();
    const form = screen.getByRole('form', `Correct ${date}`);

    await form.getByRole('textbox', 'Time in').fill(timeIn);
    await form.getByRole('textbox', 'Time out').fill(timeOut);
    await form.getByRole('textbox', 'Approved overtime (hours)').fill(overtime);
    await form.getByRole('button', 'Save day').tap();
    await expect(form).toBeHidden();
  }

  // Staying until 7:00 PM is not overtime by itself; the two approved hours are.
  await expect(record.getByRole('row', /^Wed · Oct 21 /).getByRole('cell', '2 hr')).toBeVisible();
  await expect(record.getByRole('row', /^Thu · Oct 22 /).getByRole('cell', 'Half day')).toBeVisible();
  await expect(record.getByRole('row', /^Mon · Oct 26 /).getByRole('cell', '30 min undertime')).toBeVisible();
  await expect(screen.getByText(/^3 of 11 working days worked so far · 8 absences · 1 half day · 30 min late or undertime · 2 hr approved overtime\./)).toBeVisible();
});
