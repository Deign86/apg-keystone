import { test, type Browser, type WebApp } from '@e2e-dev/web';
import { expect } from 'e2e';

// Interns (packages/modules/interns, docs/adr/0056, 0057): HR's register of OJT interns. The sample records have none,
// so a test that needs some puts these made-up ones where the browser keeps the records, beside the sample records,
// as HR's batches were brought over from the spreadsheet: Gio's record keeps its spreadsheet row, and a medical
// certificate date it wrote that is not a date.

const base = { start: '', end: '', schedule: 'Mon-Fri', endorsement: '', medical: '', police: '', moa: '', proof: '', volunteer: false, remarks: '' };

const INTERNS = {
  interns: [
    { ...base, no: 'IN-0001', name: 'Carla Diaz', school: 'Sample Tech', batch: 2, start: '2025-10-15', end: '2026-02-18', hours: 500, idNo: 'APG-2026-010', endorsement: '2026-01-27', medical: '2026-02-19', police: 'N/A', moa: '2026-01-27', proof: 'Certificate', status: 'Completed', volunteer: true, remarks: 'Complete/Volunteer' },
    { ...base, no: 'IN-0002', name: 'Dan Uy', school: 'Sample Tech', batch: 2, start: '2025-11-03', end: '2026-02-20', hours: 500, idNo: 'APG-2026-011', endorsement: '2025-11-03', medical: '2025-11-03', moa: '2026-01-27', proof: 'Certificate', status: 'Incomplete requirements', remarks: 'inc' },
    { ...base, no: 'IN-0003', name: 'Fe Lim', school: 'Sample University', batch: 3, start: '2026-08-04', end: '2026-10-16', hours: 300, idNo: 'APG-2026-014', endorsement: '2026-09-09', medical: '2026-09-29', police: '2026-10-05', moa: '2026-09-09', status: 'Completed' },
    {
      ...base, no: 'IN-0004', name: 'Gio Sy', school: 'Sample University', batch: 3, start: '2026-10-26', hours: 486, idNo: 'APG-2026-015', endorsement: '2026-10-27', medical: '70-03-2026', moa: '2026-10-27', status: 'Ongoing',
      source: { file: 'INTERNS SAMPLE.xlsx', sheet: 'BATCH 3', row: 3, fill: '', cells: [{ column: 'NAME', text: 'Gio Sy' }, { column: 'Med Cert', text: '70-03-2026' }] },
    },
    { ...base, no: 'IN-0005', name: 'Hana Go', school: 'Psychology/HR', batch: 3, start: '2026-09-10', hours: 300, idNo: 'APG-2026-016', endorsement: '2026-09-10', medical: '2026-09-16', police: '2026-09-11', moa: '2026-09-14', status: 'Ongoing' },
  ],
  roster: [{ day: 'Monday', names: ['Gio Sy', 'Hana Go'] }, { day: 'Friday', names: ['Dan Uy'] }],
};

/** Opens Interns with the made-up interns saved beside the sample records. */
async function withInterns(app: WebApp, browser: Browser) {
  await app.open('/#interns');
  await browser.evaluate((interns: string) => {
    const state = JSON.parse(localStorage.getItem('keystone-state') ?? '{}');

    localStorage.setItem('keystone-state', JSON.stringify({ ...state, ext: { ...state.ext, interns: JSON.parse(interns) } }));
  }, JSON.stringify(INTERNS));
  await browser.reload();
}

test('starts empty, with nothing to import, and adds the first intern with the first ID number', async ({ app, screen }) => {
  await app.open('/#interns');

  await expect(screen.getByRole('heading', { name: 'Interns', level: 1 })).toBeVisible();
  await expect(screen.getByText('No interns yet. Add each one as their OJT starts: their school, dates, requirements and ID number.')).toBeVisible();
  await expect(screen.getByRole('button', /Import/)).toBeHidden();

  await screen.getByRole('button', 'Add intern').tap();
  const form = screen.getByRole('dialog', 'Add intern').getByRole('form', 'New intern');

  await expect(form.getByRole('textbox', 'Batch')).toHaveValue('1');
  await expect(form.getByRole('textbox', 'ID number')).toHaveValue('APG-2026-001');
  await form.getByRole('button', 'Add intern').tap();
  await expect(form.getByRole('alert')).toHaveText('Enter the intern’s name.');

  await form.getByRole('textbox', 'Name').fill('maria santos');
  await form.getByRole('combobox', 'School').fill('Sample College');
  await form.getByRole('textbox', 'OJT hours').fill('486');
  await form.getByRole('button', 'Add intern').tap();
  await expect(screen.getByRole('dialog', 'Maria Santos added to Batch 1.')).toBeVisible();
  await expect(screen.getByRole('table', 'Interns').getByRole('row', /^APG-2026-001 Maria Santos Sample College 1 From Nov 2, 2026 486 hours 0 of 4 Ongoing Actions/)).toBeVisible();
  await expect(screen.getByText('1 intern in 1 batch; 1 on OJT now, 1 still owing requirements.')).toBeVisible();

  // Kept, and in the Activity Log.
  await app.open('/#activity');
  await screen.getByRole('group', 'Module').getByRole('button', 'Interns').tap();
  await expect(screen.getByText('Intern Maria Santos (Batch 1) added.')).toBeVisible();
});

test('lists the interns by batch, filtered by status and batch, and adds the next with the next ID number', async ({ app, screen, browser }) => {
  await withInterns(app, browser);

  await expect(screen.getByText('5 interns in 2 batches; 2 on OJT now, 2 still owing requirements.')).toBeVisible();
  const register = screen.getByRole('table', 'Interns');

  await expect(register.getByRole('row', /^APG-2026-015 Gio Sy Sample University 3 From Oct 26, 2026 486 hours 3 of 4 Ongoing Check dates Actions/)).toBeVisible();
  await expect(register.getByRole('row', /^APG-2026-014 Fe Lim Sample University 3 Aug 4, 2026 – Oct 16, 2026 300 hours 4 of 4 Completed Actions/)).toBeVisible();
  await expect(register.getByRole('row', /^APG-2026-010 Carla Diaz Sample Tech 2 Oct 15, 2025 – Feb 18, 2026 500 hours 4 of 4 Completed Volunteer Actions/)).toBeVisible();
  await expect(register.getByRole('row', /^APG-2026-011 Dan Uy Sample Tech 2 .* Incomplete Actions/)).toBeVisible();

  const show = screen.getByRole('group', 'Show');

  await show.getByRole('button', /^Completed/).tap();
  await expect(register.getByRole('row')).toHaveCount(3);
  await show.getByRole('button', /^All/).tap();
  await screen.getByRole('combobox', 'Batch').tap();
  await screen.getByRole('option', 'Batch 2').tap();
  await expect(register.getByRole('row')).toHaveCount(3);

  await screen.getByRole('button', 'Add intern').tap();
  const form = screen.getByRole('dialog', 'Add intern').getByRole('form', 'New intern');

  await expect(form.getByRole('textbox', 'Batch')).toHaveValue('3');
  await expect(form.getByRole('textbox', 'ID number')).toHaveValue('APG-2026-017');

  await app.open('/#overview');
  await expect(screen.getByText(/Interns on OJT\s*2\s*2 owing requirements · 1 certificate to issue/)).toBeVisible();
  await expect(screen.getByRole('button', 'Add an intern')).toBeVisible();
  await app.open('/');
  await expect(screen.getByRole('main').getByRole('list').first().getByRole('button', /^Interns .* On OJT 2$/)).toBeVisible();
});

test('shows the spreadsheet row a record came from, and keeps a date it wrote until one is typed over it', async ({ app, screen, browser }) => {
  await withInterns(app, browser);
  await screen.getByRole('group', 'Show').getByRole('button', /^Dates to check/).tap();
  await screen.getByRole('table', 'Interns').getByRole('row', /Gio Sy/).tap();
  const sheet = screen.getByRole('dialog', 'Gio Sy');
  const form = sheet.getByRole('form', 'Edit Gio Sy');

  await expect(form.getByText('The spreadsheet says “70-03-2026”; enter the date to replace it.')).toBeVisible();
  await expect(sheet.getByText('INTERNS SAMPLE.xlsx, tab “BATCH 3”, row 3. Each cell as it was written:')).toBeVisible();
  await expect(sheet.getByRole('definition').filter({ hasText: '70-03-2026' })).toBeVisible();

  await form.getByRole('textbox', 'Medical certificate').fill('2026-10-28');
  await form.getByRole('textbox', 'Police clearance').fill('2026-11-02');
  await form.getByRole('button', 'Save changes').tap();
  await expect(screen.getByRole('dialog', 'Gio Sy updated.')).toBeVisible();

  // Nothing is left to check, and the filter that showed it gives way to everyone.
  await expect(screen.getByRole('group', 'Show').getByRole('button', /^Dates to check/)).toBeHidden();
  await expect(screen.getByRole('table', 'Interns').getByRole('row')).toHaveCount(6);
  await expect(screen.getByText('5 interns in 2 batches; 2 on OJT now, 1 still owing requirements.')).toBeVisible();
});

test('marks a requirement handed in, and keeps the cleaning schedule', async ({ app, screen, browser }) => {
  await withInterns(app, browser);
  await screen.getByRole('tab', /^Requirements/).tap();
  const owed = screen.getByRole('table', 'Requirements owed');

  await expect(owed.getByRole('row', /^Gio Sy Batch 3 Oct 27, 2026 70-03-2026 Not yet Oct 27, 2026/)).toBeVisible();
  await expect(owed.getByRole('row', /^Dan Uy Batch 2 · done, requirements incomplete/)).toBeVisible();
  await owed.getByRole('button', 'Actions for Gio Sy').tap();
  await screen.getByRole('menuitem', 'Police clearance handed in today').tap();
  await expect(screen.getByRole('dialog', 'Gio Sy’s police clearance marked handed in today.')).toBeVisible();
  // Gio owes nothing now, so only Dan is left.
  await expect(owed.getByRole('row', /Gio Sy/)).toBeHidden();
  await expect(owed.getByRole('row')).toHaveCount(2);

  await screen.getByRole('tab', /^Cleaning schedule/).tap();
  await expect(screen.getByRole('list', 'Cleaning on Monday').getByRole('listitem')).toHaveText(['Gio Sy Remove', 'Hana Go Remove']);
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
