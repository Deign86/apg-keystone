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

test('times an employee out only after the minute they timed in, and Overview counts who is in and late', async ({ app, screen }) => {
  await app.open('/#timekeeping');
  const today = screen.getByRole('table', 'Today');

  // A time out in the same minute as the time in is refused, and the button stays.
  await today.getByRole('button', 'Time in Angelica S. Bautista').tap();
  await today.getByRole('button', 'Time out Angelica S. Bautista').tap();
  await expect(screen.getByRole('dialog', 'Angelica S. Bautista timed in at 10:00 AM; time out after that.')).toBeVisible();
  await expect(today.getByRole('button', 'Time out Angelica S. Bautista')).toBeVisible();

  // Juan came in at 8:00 but forgot to time in: HR corrects today, then he times out now.
  await screen.getByRole('table', 'Daily time record').getByRole('row', /^Mon · Nov 2 /).tap();
  const form = screen.getByRole('form', 'Correct Nov 2, 2026');

  await form.getByRole('textbox', 'Time in').fill('08:00');
  await form.getByRole('button', 'Save day').tap();
  await expect(form).toBeHidden();
  await today.getByRole('button', 'Time out Juan Miguel P. Reyes').tap();
  await expect(screen.getByRole('dialog', 'Juan Miguel P. Reyes timed out at 10:00 AM.')).toBeVisible();

  const row = today.getByRole('row', /^Juan Miguel P\. Reyes /);

  // Out before the lunch hour ends: only the morning, so a half day.
  await expect(row.getByRole('cell', '8:00 AM')).toBeVisible();
  await expect(row.getByRole('cell', '10:00 AM')).toBeVisible();
  await expect(row.getByRole('cell', 'Half day')).toBeVisible();
  await expect(row.getByRole('cell', 'Done')).toBeVisible();

  // Two in, and only Angelica came late.
  await app.open('/#overview');
  await expect(screen.getByRole('definition').filter({ hasText: '2 of 4' })).toBeVisible();
  await expect(screen.getByRole('definition').filter({ hasText: '1 late' })).toBeVisible();

  // The refused time out wrote nothing.
  await app.open('/#activity');
  await screen.getByRole('group', 'Module').getByRole('button', 'Timekeeping').tap();
  const entries = screen.getByRole('region', 'Entries').getByRole('listitem');

  await expect(entries).toHaveCount(3);
  await expect(entries).toContainText([
    'DTR Juan Miguel P. Reyes timed out at 10:00 AM.',
    'DTR Nov 2, 2026 for Juan Miguel P. Reyes corrected: in 8:00 AM.',
    'DTR Angelica S. Bautista timed in at 10:00 AM, 2 hr late.',
  ]);
});

test('shows the daily time record of the employee picked', async ({ app, screen }) => {
  await app.open('/#timekeeping');
  await screen.getByRole('table', 'Today').getByRole('button', 'Time in Angelica S. Bautista').tap();
  const record = screen.getByRole('table', 'Daily time record');

  // The first employee's record shows until another is picked.
  await expect(record.getByRole('row', /^Mon · Nov 2 /).getByRole('cell', 'Not in yet')).toBeVisible();

  await screen.getByRole('combobox', 'Employee').tap();
  await screen.getByRole('option', 'Angelica S. Bautista').tap();
  const day = record.getByRole('row', /^Mon · Nov 2 /);

  await expect(day.getByRole('cell', '10:00 AM')).toBeVisible();
  await expect(day.getByRole('cell', 'Late 2 hr')).toBeVisible();

  // Opening a day corrects hers, not his.
  await day.tap();
  await expect(screen.getByRole('form', 'Correct Nov 2, 2026')).toContainText('Angelica S. Bautista · Nov 2, 2026');
});

test('corrects a day with a note, refuses times it cannot read, and leaves the day as it was on Cancel', async ({ app, screen }) => {
  await app.open('/#timekeeping');
  await screen.getByRole('combobox', 'Cut-off').tap();
  await screen.getByRole('option', 'Oct 16–31, 2026').tap();
  const record = screen.getByRole('table', 'Daily time record');

  await record.getByRole('row', /^Thu · Oct 29 /).tap();
  let form = screen.getByRole('form', 'Correct Oct 29, 2026');

  await form.getByRole('textbox', 'Time in').fill('08:00');
  await form.getByRole('button', 'Cancel').tap();
  await expect(form).toBeHidden();
  await expect(record.getByRole('row', /^Thu · Oct 29 /).getByRole('cell', 'Absent')).toBeVisible();

  await record.getByRole('row', /^Fri · Oct 30 /).tap();
  form = screen.getByRole('form', 'Correct Oct 30, 2026');
  const timeIn = form.getByRole('textbox', 'Time in');
  const timeOut = form.getByRole('textbox', 'Time out');
  const overtime = form.getByRole('textbox', 'Approved overtime (hours)');
  // Each refusal is also a message at the foot of the window, and three of them stack over the Save button, so
  // these are saved with Enter.
  await timeIn.fill('8');
  await timeOut.fill('17:00');
  await timeOut.press('Enter');
  await expect(form.getByRole('alert')).toHaveText('Enter the time in as hours and minutes, like 08:00.');

  await timeIn.fill('08:10');
  await timeOut.fill('5 PM');
  await timeOut.press('Enter');
  await expect(form.getByRole('alert')).toHaveText('Enter the time out as hours and minutes, like 17:00.');

  await timeIn.fill('');
  await timeOut.fill('17:00');
  await timeOut.press('Enter');
  await expect(form.getByRole('alert')).toHaveText('Enter the time in as well as the time out.');

  await timeIn.fill('08:10');
  await overtime.fill('20');
  await overtime.press('Enter');
  await expect(form.getByRole('alert')).toHaveText('Enter overtime as hours, from 0 to 16.');

  // The note is shown in the day's remarks.
  await overtime.fill('');
  const note = form.getByRole('textbox', 'Note');

  await note.fill('Badge reader was down');
  await note.press('Enter');
  await expect(screen.getByRole('dialog', 'Oct 30, 2026 saved for Juan Miguel P. Reyes.')).toBeVisible();

  const friday = record.getByRole('row', /^Fri · Oct 30 /);

  await expect(friday.getByRole('cell', 'On time (grace)')).toBeVisible();
  await expect(friday.getByRole('cell', 'Badge reader was down')).toBeVisible();

  await app.open('/#activity');
  await screen.getByRole('group', 'Module').getByRole('button', 'Timekeeping').tap();
  const entries = screen.getByRole('region', 'Entries').getByRole('listitem');

  await expect(entries).toHaveCount(1);
  await expect(entries.first()).toContainText('DTR Oct 30, 2026 for Juan Miguel P. Reyes corrected: in 8:10 AM, out 5:00 PM.');
});

test('names a past day left without a time-out, and clears a day HR empties', async ({ app, screen }) => {
  await app.open('/#timekeeping');
  await screen.getByRole('combobox', 'Cut-off').tap();
  await screen.getByRole('option', 'Oct 16–31, 2026').tap();
  const friday = screen.getByRole('table', 'Daily time record').getByRole('row', /^Fri · Oct 30 /);

  await friday.tap();
  let form = screen.getByRole('form', 'Correct Oct 30, 2026');

  await form.getByRole('textbox', 'Time in').fill('08:00');
  await form.getByRole('button', 'Save day').tap();
  await expect(form).toBeHidden();

  // The screen's line becomes the finding, and the day says what is missing.
  await expect(screen.getByText('Juan Miguel P. Reyes did not time out on Oct 30, 2026.')).toBeVisible();
  await expect(friday.getByRole('cell', 'No time-out')).toBeVisible();

  // Clearing every field removes the day.
  await friday.tap();
  form = screen.getByRole('form', 'Correct Oct 30, 2026');
  await form.getByRole('textbox', 'Time in').fill('');
  await form.getByRole('button', 'Save day').tap();
  await expect(screen.getByRole('dialog', 'Oct 30, 2026 cleared for Juan Miguel P. Reyes.')).toBeVisible();
  await expect(friday.getByRole('cell', 'Absent')).toBeVisible();
  await expect(screen.getByText(/^0 of 4 employees timed in today\./)).toBeVisible();

  await app.open('/#activity');
  await screen.getByRole('group', 'Module').getByRole('button', 'Timekeeping').tap();
  await expect(screen.getByRole('region', 'Entries').getByRole('listitem').first()).toContainText('DTR Oct 30, 2026 cleared for Juan Miguel P. Reyes.');
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

test('needs a holiday\'s date and name, and shows the holiday on today\'s board and in the daily time record', async ({ app, screen }) => {
  await app.open('/#timekeeping');
  const form = screen.getByRole('form', 'Add a holiday');

  // The date starts at today; the name does not.
  await form.getByRole('button', 'Add holiday').tap();
  await expect(form.getByRole('alert')).toHaveText('Enter the holiday\'s name.');

  await form.getByRole('textbox', 'Date').fill('');
  await form.getByRole('textbox', 'Holiday').fill('All Souls\' Day');
  await form.getByRole('button', 'Add holiday').tap();
  await expect(form.getByRole('alert')).toHaveText('Enter the holiday\'s date.');

  await form.getByRole('textbox', 'Date').fill('2026-11-02');
  await form.getByRole('combobox', 'Kind').tap();
  await screen.getByRole('option', 'Special non-working day').tap();
  await form.getByRole('button', 'Add holiday').tap();
  await expect(screen.getByRole('table', 'Holidays').getByRole('row', /^Nov 2, 2026 All Souls' Day Special non-working day/)).toBeVisible();

  // No one is "not in yet" on a holiday.
  await expect(screen.getByRole('table', 'Today').getByRole('row', /^Juan Miguel P\. Reyes /).getByRole('cell', 'Holiday')).toBeVisible();

  const day = screen.getByRole('table', 'Daily time record').getByRole('row', /^Mon · Nov 2 /);

  await expect(day.getByRole('cell', 'Holiday')).toBeVisible();
  await expect(day.getByRole('cell', 'All Souls\' Day (special holiday)')).toBeVisible();
});

test('removes a holiday only after asking', async ({ app, screen }) => {
  await app.open('/#timekeeping');
  const form = screen.getByRole('form', 'Add a holiday');

  await form.getByRole('textbox', 'Date').fill('2026-11-30');
  await form.getByRole('textbox', 'Holiday').fill('Bonifacio Day');
  await form.getByRole('button', 'Add holiday').tap();
  const holidays = screen.getByRole('table', 'Holidays');

  await expect(holidays.getByRole('row', /^Nov 30, 2026 Bonifacio Day /)).toBeVisible();

  // Cancel keeps it.
  await holidays.getByRole('button', 'Actions for 2026-11-30').tap();
  await screen.getByRole('menuitem', 'Remove…').tap();
  let confirm = screen.getByRole('alertdialog', 'Remove Bonifacio Day?');

  await expect(confirm).toContainText('Nov 30, 2026 becomes an ordinary day for timekeeping and payroll.');
  await confirm.getByRole('button', 'Cancel').tap();
  await expect(confirm).toBeHidden();
  await expect(holidays.getByRole('row', /^Nov 30, 2026 Bonifacio Day /)).toBeVisible();

  await holidays.getByRole('button', 'Actions for 2026-11-30').tap();
  await screen.getByRole('menuitem', 'Remove…').tap();
  confirm = screen.getByRole('alertdialog', 'Remove Bonifacio Day?');
  await confirm.getByRole('button', 'Remove holiday').tap();
  await expect(screen.getByRole('dialog', 'Nov 30, 2026 is no longer a holiday.')).toBeVisible();
  await expect(holidays.getByRole('row', /^Nov 30, 2026 /)).toBeHidden();
  await expect(screen.getByText('No holidays set. Add the ones the office observes.')).toBeVisible();

  await app.open('/#activity');
  await screen.getByRole('group', 'Module').getByRole('button', 'Timekeeping').tap();
  const entries = screen.getByRole('region', 'Entries').getByRole('listitem');

  await expect(entries).toHaveCount(2);
  await expect(entries).toContainText(['DTR Nov 30, 2026 is no longer a holiday.', 'DTR Nov 30, 2026 set as a regular holiday: Bonifacio Day.']);
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
