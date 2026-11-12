import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { startEmpty } from '../support/sample-records';

// Company Details (packages/modules/company): the company's name, address and contacts as documents print them, and
// what each new document starts from, kept with the records and nowhere else (docs/adr/0018). The tests' sample records
// hold APG's details; a computer that saved none has none.

test('is last under Settings, and shows the details saved', async ({ app, screen }) => {
  await app.open('/');
  const rail = screen.getByRole('navigation', 'Keystone').getByRole('list').getByRole('button');

  await expect(rail.last()).toHaveAccessibleName(/Company Details$/);
  await rail.last().tap();

  await expect(screen.getByRole('heading', { name: 'Company Details', level: 1 })).toBeVisible();
  await expect(screen.getByText('What vouchers, statements, IDs and payslips print, and what each new one starts from.')).toBeVisible();
  const form = screen.getByRole('form', 'Company details');

  await expect(form.getByRole('textbox', 'Name')).toHaveValue('ALPHA PREMIER GROUP OF COMPANIES OPC');
  await expect(form.getByRole('textbox', 'Short address')).toHaveValue('Tektite East Tower, Ortigas Center, Pasig');
  await expect(form.getByRole('textbox', 'Days to pay')).toHaveValue('15');
});

test('saves a change, which the sidebar, the documents and the Activity Log show', async ({ app, screen }) => {
  await app.open('/#company');
  const form = screen.getByRole('form', 'Company details');

  await form.getByRole('textbox', 'Short address').fill('  PSE Centre,   Ortigas ');
  await form.getByRole('textbox', 'Audited by').fill('Finance');
  await form.getByRole('button', 'Save company details').tap();

  await expect(screen.getByRole('dialog', 'Company details saved.')).toBeVisible();
  await expect(form.getByRole('textbox', 'Short address')).toHaveValue('PSE Centre, Ortigas');
  await expect(screen.getByRole('button', 'ALPHA PREMIER KEYSTONE PSE Centre, Ortigas')).toBeVisible();

  // Saved with the records: still there after a reload.
  await app.open('/#company');
  await expect(screen.getByRole('form', 'Company details').getByRole('textbox', 'Audited by')).toHaveValue('Finance');

  await app.open('/#activity');
  await expect(screen.getByRole('region', 'Entries').getByText('Company details for ALPHA PREMIER GROUP OF COMPANIES OPC saved.')).toBeVisible();
});

test('a computer with nothing saved starts blank, says so on Home, and fills them in', async ({ app, screen, browser }) => {
  await app.open('/');
  await startEmpty(app, browser);

  // No records and no company details: nothing is made up to fill them.
  await expect(screen.getByText('Fill in Company Details: documents print without the company\'s name and address until then.')).toBeVisible();
  await expect(screen.getByRole('button', /^ALPHA PREMIER KEYSTONE$/)).toBeVisible();

  await app.open('/#company');
  const form = screen.getByRole('form', 'Company details');

  await expect(screen.getByText(/^Not filled in yet/)).toBeVisible();
  await expect(form.getByRole('textbox', 'Name')).toHaveValue('');
  await form.getByRole('button', 'Save company details').tap();
  await expect(form.getByRole('alert')).toHaveText('Enter the company\'s name, as its documents print it.');

  await form.getByRole('textbox', 'Name').fill('Alpha Premier Group');
  await form.getByRole('textbox', 'Days to pay').fill('two weeks');
  await form.getByRole('button', 'Save company details').tap();
  await expect(form.getByRole('alert')).toHaveText('Enter the days to pay as a whole number from 0 to 365, or leave it blank.');

  await form.getByRole('textbox', 'Days to pay').fill('');
  await form.getByRole('button', 'Save company details').tap();
  await expect(screen.getByRole('dialog', 'Company details saved.')).toBeVisible();

  await app.open('/');
  await expect(screen.getByText(/^Fill in Company Details/)).toBeHidden();

  // A new voucher's letterhead prints the name saved.
  await app.open('/#vouchers');
  await expect(screen.getByRole('article', 'Check voucher 888-001').getByText('Alpha Premier Group')).toBeVisible();
});
