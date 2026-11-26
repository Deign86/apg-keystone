import { test } from '@e2e-dev/web';
import { expect, type Screen } from 'e2e';

// Interns (packages/modules/interns, docs/adr/0056): HR's spreadsheet of OJT interns brought in, then kept here. The
// sample records have no interns. packages/modules/interns/test/fixtures/sample-interns.xlsx is a made-up workbook laid
// out as HR's is: three batch tabs, whose columns grew over time, rows coloured by status with a legend under batch 3,
// dates typed as text and one that is not a date at all, the cleaning schedule, and a tab that is neither.

const WORKBOOK = 'packages/modules/interns/test/fixtures/sample-interns.xlsx';

/** Imports the sample workbook, as Ma'am Jean would her spreadsheet. */
async function importSample(screen: Screen) {
  await screen.getByRole('button', 'Import from spreadsheet…').setInputFiles(WORKBOOK);
  const confirm = screen.getByRole('alertdialog', 'Import sample-interns.xlsx?');

  await expect(confirm.getByText(
    'sample-interns.xlsx has 8 interns in batches 1 to 3 and the cleaning schedule. 8 interns are new and will be added, every cell of their row kept as written.'
    + ' The cleaning schedule will be brought in. Not brought in: Notes, which is neither a batch nor the cleaning schedule.',
  )).toBeVisible();
  await confirm.getByRole('button', 'Import').tap();
  await expect(screen.getByRole('dialog', 'Imported 8 interns in batches 1 to 3 and the cleaning schedule.')).toBeVisible();
}

test('brings HR’s spreadsheet in, every batch and the cleaning schedule, and a second import adds nothing', async ({ app, screen, browser }) => {
  await app.open('/#interns');

  await expect(screen.getByRole('heading', { name: 'Interns', level: 1 })).toBeVisible();
  await expect(screen.getByText('No interns yet. Import HR’s spreadsheet to bring every batch in, or add an intern.')).toBeVisible();
  await importSample(screen);

  await expect(screen.getByText('8 interns in 3 batches; 2 on OJT now, 2 still owing requirements.')).toBeVisible();
  const register = screen.getByRole('table', 'Interns');

  // Newest batch first. Each status is read from the remarks, or from the row's colour against the legend.
  await expect(register.getByRole('row', /^APG-2026-015 Gio Sy Sample University 3 From Oct 26, 2026 486 hours 3 of 4 Ongoing Check dates/)).toBeVisible();
  await expect(register.getByRole('row', /^APG-2026-014 Fe Lim Sample University 3 Aug 4, 2026 – Oct 16, 2026 300 hours 4 of 4 Completed Actions/)).toBeVisible();
  await expect(register.getByRole('row', /^APG-2026-010 Carla Diaz Sample Tech 2 Oct 15, 2025 – Feb 18, 2026 500 hours 4 of 4 Completed Volunteer Actions/)).toBeVisible();
  await expect(register.getByRole('row', /^APG-2026-011 Dan Uy Sample Tech 2 .* Incomplete Actions/)).toBeVisible();
  await expect(register.getByRole('row', /^APG - 0888 009 Ella Tan Sample Tech 2 .* Terminated Actions/)).toBeVisible();

  // Filtered by status and by batch.
  const show = screen.getByRole('group', 'Show');

  await show.getByRole('button', /^Terminated/).tap();
  await expect(register.getByRole('row')).toHaveCount(3);
  await show.getByRole('button', /^All/).tap();
  await screen.getByRole('combobox', 'Batch').tap();
  await screen.getByRole('option', 'Batch 1').tap();
  await expect(register.getByRole('row', /Ana Reyes Sample State University 1 Jun 2, 2025 – Jul 18, 2025 240 hours — Completed Actions/)).toBeVisible();
  await expect(register.getByRole('row')).toHaveCount(3);

  // The cleaning schedule, each name under its day.
  await screen.getByRole('tab', /^Cleaning schedule/).tap();
  await expect(screen.getByRole('list', 'Cleaning on Monday').getByRole('listitem')).toHaveText(['Gio Sy Remove', 'Hana Go Remove']);
  await expect(screen.getByRole('list', 'Cleaning on Friday').getByRole('listitem')).toHaveText(['Dan Uy Remove']);

  // A second import of the same file finds everything already here.
  await screen.getByRole('button', 'Import from spreadsheet…').setInputFiles(WORKBOOK);
  await expect(screen.getByRole('dialog', 'Everything in sample-interns.xlsx is already in Keystone.')).toBeVisible();

  // Imported records are kept: they are there after a reload, and the import is in the Activity Log.
  await browser.reload();
  await expect(screen.getByText('8 interns in 3 batches; 2 on OJT now, 2 still owing requirements.')).toBeVisible();
  await app.open('/#activity');
  await screen.getByRole('group', 'Module').getByRole('button', 'Interns').tap();
  await expect(screen.getByText('Imported 8 interns in batches 1 to 3 and the cleaning schedule from sample-interns.xlsx.')).toBeVisible();
});

test('refuses a file that is not a workbook, saying how to get one', async ({ app, screen }) => {
  await app.open('/#interns');
  await screen.getByRole('button', 'Import from spreadsheet…').setInputFiles('e2e/support/fixtures/not-a-keystone-backup.json');

  await expect(screen.getByRole('dialog', 'That file is not an Excel workbook (.xlsx). In Google Sheets, use File › Download › Microsoft Excel (.xlsx).')).toBeVisible();
  await expect(screen.getByText('No interns yet. Import HR’s spreadsheet to bring every batch in, or add an intern.')).toBeVisible();
});

test('shows a row as the spreadsheet had it, and a date it wrote that is not a date until one is typed over it', async ({ app, screen }) => {
  await app.open('/#interns');
  await importSample(screen);
  await screen.getByRole('group', 'Show').getByRole('button', /^Dates to check/).tap();
  await screen.getByRole('table', 'Interns').getByRole('row', /Gio Sy/).tap();
  const sheet = screen.getByRole('dialog', 'Gio Sy');
  const form = sheet.getByRole('form', 'Edit Gio Sy');

  await expect(form.getByText('The spreadsheet says “70-03-2026”; enter the date to replace it.')).toBeVisible();
  await expect(sheet.getByText('sample-interns.xlsx, tab “BATCH 3”, row 3. Each cell as it was written:')).toBeVisible();
  await expect(sheet.getByRole('definition').filter({ hasText: '70-03-2026' })).toBeVisible();

  await form.getByRole('textbox', 'Medical certificate').fill('2026-10-28');
  await form.getByRole('textbox', 'Police clearance').fill('2026-11-02');
  await form.getByRole('button', 'Save changes').tap();
  await expect(screen.getByRole('dialog', 'Gio Sy updated.')).toBeVisible();

  // Nothing is left to check, and Gio owes nothing; the row the spreadsheet wrote is still kept as it was.
  await expect(screen.getByRole('group', 'Show').getByRole('button', /^Dates to check/)).toBeHidden();
  await expect(screen.getByText('8 interns in 3 batches; 2 on OJT now, 1 still owing requirements.')).toBeVisible();
  await screen.getByRole('table', 'Interns').getByRole('row', /Gio Sy/).tap();
  await expect(screen.getByRole('dialog', 'Gio Sy').getByRole('definition').filter({ hasText: '70-03-2026' })).toBeVisible();
});

test('marks a requirement handed in, and keeps the cleaning schedule', async ({ app, screen }) => {
  await app.open('/#interns');
  await importSample(screen);
  await screen.getByRole('tab', /^Requirements/).tap();
  const owed = screen.getByRole('table', 'Requirements owed');

  await expect(owed.getByRole('row', /^Gio Sy Batch 3 Oct 27, 2026 70-03-2026 Not yet Oct 27, 2026/)).toBeVisible();
  await expect(owed.getByRole('row', /^Dan Uy Batch 2 · done, requirements incomplete/)).toBeVisible();
  await owed.getByRole('button', 'Actions for Gio Sy').tap();
  await screen.getByRole('menuitem', 'Police clearance handed in today').tap();
  await expect(screen.getByRole('dialog', 'Gio Sy’s police clearance marked handed in today.')).toBeVisible();
  // Gio owes nothing now, so only Dan is left; the register shows the date Gio's came in.
  await expect(owed.getByRole('row', /Gio Sy/)).toBeHidden();
  await expect(owed.getByRole('row')).toHaveCount(2);
  await screen.getByRole('tab', /^Register/).tap();
  await expect(screen.getByRole('table', 'Interns').getByRole('row', /^APG-2026-015 Gio Sy .* 4 of 4 Ongoing Check dates/)).toBeVisible();

  await screen.getByRole('tab', /^Cleaning schedule/).tap();
  const wednesday = screen.getByRole('form', 'Add to Wednesday');

  await wednesday.getByRole('combobox', 'Who cleans on Wednesday').fill('Hana Go');
  await wednesday.getByRole('button', 'Add').tap();
  await expect(screen.getByRole('dialog', 'Hana Go cleans on Wednesday.')).toBeVisible();
  await screen.getByRole('button', 'Take Hana Go off Monday').tap();
  await expect(screen.getByRole('list', 'Cleaning on Monday').getByRole('listitem')).toHaveText(['Gio Sy Remove']);
  await expect(screen.getByRole('list', 'Cleaning on Wednesday').getByRole('listitem')).toHaveText(['Hana Go Remove']);

  // Putting the same person on a day twice is refused, on that day's field.
  await wednesday.getByRole('combobox', 'Who cleans on Wednesday').fill('hana go');
  await wednesday.getByRole('button', 'Add').tap();
  await expect(screen.getByRole('region', 'Wednesday').getByRole('alert')).toHaveText('Hana Go already cleans on Wednesday.');
});

test('adds an intern with the next ID number, and Overview and Home count them', async ({ app, screen }) => {
  await app.open('/#interns');
  await importSample(screen);
  await screen.getByRole('button', 'Add intern').tap();
  const form = screen.getByRole('dialog', 'Add intern').getByRole('form', 'New intern');

  await expect(form.getByRole('textbox', 'Batch')).toHaveValue('3');
  await expect(form.getByRole('textbox', 'ID number')).toHaveValue('APG-2026-017');
  await form.getByRole('button', 'Add intern').tap();
  await expect(form.getByRole('alert')).toHaveText('Enter the intern’s name.');

  await form.getByRole('textbox', 'Name').fill('maria santos');
  await form.getByRole('combobox', 'School').fill('Sample College');
  await form.getByRole('textbox', 'OJT hours').fill('486');
  await form.getByRole('button', 'Add intern').tap();
  await expect(screen.getByRole('dialog', 'Maria Santos added to Batch 3.')).toBeVisible();
  await expect(screen.getByRole('table', 'Interns').getByRole('row', /^APG-2026-017 Maria Santos Sample College 3 From Nov 2, 2026 486 hours 0 of 4 Ongoing Actions/)).toBeVisible();

  await app.open('/#overview');
  await expect(screen.getByText(/Interns on OJT\s*3\s*3 owing requirements · 1 certificate to issue/)).toBeVisible();
  await expect(screen.getByRole('button', 'Add an intern')).toBeVisible();
  await app.open('/');
  await expect(screen.getByRole('main').getByRole('list').first().getByRole('button', /^Interns .* On OJT 3$/)).toBeVisible();
});
