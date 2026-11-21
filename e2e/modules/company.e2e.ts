import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { startEmpty } from '../support/sample-records';

// Company Details (packages/modules/company): what each new voucher, statement and ID starts from, kept with the
// records (docs/adr/0018). The company itself, its name, address and contacts, is built in (docs/adr/0023), so it is
// on every document, in the sidebar, and the same on a computer that saved nothing.

const ADDRESS = 'Unit 3104C, Tektite East Tower Ortigas Center, Pasig, 1116 Metro Manila';

test('is last under Settings, and shows what documents start from', async ({ app, screen }) => {
  await app.open('/');
  const rail = screen.getByRole('navigation', 'Keystone').getByRole('list').getByRole('button');

  await expect(rail.last()).toHaveAccessibleName(/Company Details$/);
  await rail.last().tap();

  await expect(screen.getByRole('heading', { name: 'Company Details', level: 1 })).toBeVisible();
  await expect(screen.getByText('What each new voucher, statement and ID starts from. The company\'s name, address and contacts are built in.')).toBeVisible();
  const form = screen.getByRole('form', 'Company details');

  // Nothing to type for the company itself.
  await expect(form.getByRole('textbox', 'Name')).toBeHidden();
  await expect(form.getByRole('textbox', 'Address')).toBeHidden();
  await expect(form.getByRole('textbox', 'Audited by')).toHaveValue('Accounting');
  await expect(form.getByRole('textbox', 'Days to pay')).toHaveValue('15');
});

test('saves a change, which new documents and the Activity Log show', async ({ app, screen }) => {
  await app.open('/#company');
  const form = screen.getByRole('form', 'Company details');

  await form.getByRole('textbox', 'Audited by').fill('  Finance ');
  await form.getByRole('button', 'Save company details').tap();

  await expect(screen.getByRole('dialog', 'Company details saved.')).toBeVisible();
  await expect(form.getByRole('textbox', 'Audited by')).toHaveValue('Finance');

  // Saved with the records: still there after a reload.
  await app.open('/#company');
  await expect(screen.getByRole('form', 'Company details').getByRole('textbox', 'Audited by')).toHaveValue('Finance');

  await app.open('/#activity');
  await expect(screen.getByRole('region', 'Entries').getByText('Company details for ALPHA PREMIER GROUP OF COMPANIES OPC saved.')).toBeVisible();
});

test('a computer with nothing saved still has the company, on Home, in the sidebar and on every voucher', async ({ app, screen, browser }) => {
  await app.open('/');
  await startEmpty(app, browser);

  // No records, but the company is built in: Home asks for nothing, and the sidebar names where it is.
  await expect(screen.getByText(/^Fill in Company Details/)).toBeHidden();
  await expect(screen.getByRole('button', 'ALPHA PREMIER KEYSTONE Tektite East Tower, Ortigas Center, Pasig')).toBeVisible();

  await app.open('/#company');
  const form = screen.getByRole('form', 'Company details');

  await expect(form.getByRole('textbox', 'Audited by')).toHaveValue('');
  await form.getByRole('textbox', 'Days to pay').fill('two weeks');
  await form.getByRole('button', 'Save company details').tap();
  await expect(form.getByRole('alert')).toHaveText('Enter the days to pay as a whole number from 0 to 365, or leave it blank.');

  // A new voucher's letterhead prints the built-in address beside the logo that names the company.
  await app.open('/#vouchers');
  await screen.getByRole('tab', /^Voucher entry/).tap();
  await expect(screen.getByRole('article', 'Check voucher 888-001').getByText(ADDRESS).first()).toBeVisible();
});
