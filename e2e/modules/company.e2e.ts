import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { startEmpty } from '../support/sample-records';
import { pickSignatory, typeSignatory } from '../support/signatory';

// Company Details (packages/modules/company): what each new voucher, statement and ID starts from, kept with the
// records (docs/adr/0018). The company itself, its name, address and contacts, is built in (docs/adr/0023), so it is
// on every document, in the sidebar, and the same on a computer that saved nothing.

const ADDRESS = 'Suites 3104, Philippine Stock Exchange Centre, Tektite East Tower, Exchange Road, Ortigas Center, Pasig City 1605';

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
  await expect(form.getByRole('combobox', 'Audited by')).toHaveText('Accounting');
  await expect(form.getByRole('textbox', 'Days to pay')).toHaveValue('15');
});

test('saves a change, which new documents and the Activity Log show', async ({ app, screen }) => {
  await app.open('/#company');
  const form = screen.getByRole('form', 'Company details');

  await typeSignatory(screen, form, 'Audited by', '  Finance ');
  await form.getByRole('button', 'Save company details').tap();

  await expect(screen.getByRole('dialog', 'Company details saved.')).toBeVisible();
  await expect(form.getByRole('combobox', 'Audited by')).toHaveText('Finance');

  // Saved with the records: still there after a reload.
  await app.open('/#company');
  await expect(screen.getByRole('form', 'Company details').getByRole('combobox', 'Audited by')).toHaveText('Finance');

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

  await expect(form.getByRole('combobox', 'Audited by')).toHaveText('—');
  const days = form.getByRole('textbox', 'Days to pay');

  await days.fill('two weeks');
  await form.getByRole('button', 'Save company details').tap();
  await expect(form.getByRole('alert')).toHaveText('Enter the days to pay as a whole number from 0 to 365, or leave it blank.');
  // The field it is about is marked and has the focus, and typing in it clears the mark.
  await expect(days).toHaveAttribute('aria-invalid', 'true');
  await expect(days).toBeFocused();
  await expect(form.getByRole('textbox', 'Years an ID is valid')).not.toHaveAttribute('aria-invalid', 'true');
  await days.fill('14');
  await expect(days).not.toHaveAttribute('aria-invalid', 'true');

  // A new voucher's letterhead prints the built-in address beside the logo that names the company.
  await app.open('/#vouchers');
  await screen.getByRole('tab', /^Voucher entry/).tap();
  await expect(screen.getByRole('article', 'Check voucher 888-001').getByText(ADDRESS).first()).toBeVisible();
});

test('keeps a signature drawn for a signatory, which every paper they sign prints above their name', async ({ app, screen, browser }) => {
  await app.open('/#company');
  const panel = screen.getByRole('region', 'Signatures');

  await expect(panel.getByText('No signatures yet. Documents leave the line to sign by hand.')).toBeVisible();
  await pickSignatory(screen, panel, 'Whose signature', 'D. Lazaro');
  await panel.getByRole('button', 'Draw signature…').tap();
  const pad = screen.getByRole('dialog', 'Signature of D. Lazaro');

  await expect(pad.getByRole('button', 'Save signature')).toBeDisabled();
  await pad.getByRole('img', 'Sign here').dragTo(pad.getByRole('button', 'Clear'));
  await pad.getByRole('button', 'Save signature').tap();
  await expect(screen.getByRole('dialog', 'Signature for D. Lazaro added.')).toBeVisible();
  await expect(panel.getByRole('list', 'Signatures kept').getByRole('img', 'Signature of D. LAZARO')).toBeVisible();
  // Whose signature to add still lists everyone who could sign.
  await panel.getByRole('combobox', 'Whose signature').tap();
  await expect(screen.getByRole('option', 'Accounting')).toBeVisible();
  await screen.getByRole('option', 'D. Lazaro').tap();

  // D. Lazaro prepares the next statement and voucher: their signature is over the line.
  await app.open('/#billing');
  await screen.getByRole('tab', /^Statement entry/).tap();
  await expect(screen.getByRole('article', /^Billing statement /).getByRole('img', 'Signature of D. Lazaro')).toBeVisible();
  // The CEO resizes it where the paper shows it, from its handle: kept for that signatory, on every paper.
  const handle = screen.getByRole('article', /^Billing statement /).getByRole('slider', 'Size of D. Lazaro\'s signature');

  await expect(handle).toHaveAttribute('aria-valuenow', '100');
  await handle.press('ArrowUp');
  await handle.press('ArrowUp');
  await expect(handle).toHaveAttribute('aria-valuenow', '120');

  // Trimmed to its ink: the drawing's empty pad (480 × 160) is cut away, so the signature fills its box, three times as
  // wide as high, at the size picked (3rem × 1.2 high).
  const signature = () => browser.evaluate(() => [...document.querySelectorAll<HTMLImageElement>('[data-ui="document"] img[alt="Signature of D. Lazaro"]')]
    .map((img) => ({
      trimmed: img.naturalWidth < 480 && img.naturalHeight < 160,
      height: img.parentElement?.style.height, width: img.parentElement?.style.width, transform: img.parentElement?.style.transform,
    }))[0]);

  await expect.poll(async () => (await signature())?.trimmed).toBe(true);
  expect(await signature()).toMatchObject({ height: '3.6rem', width: '10.8rem' });
  // Moved with Shift and the arrows, a correction where trimming left it off.
  await handle.press('Shift+ArrowRight');
  await handle.press('Shift+ArrowUp');
  await expect.poll(async () => (await signature())?.transform).toBe('translate(calc(-50% + 0.25rem), -0.25rem)');
  // A signatory is picked from whose signatures are kept, as they are kept, so whoever is picked signs.
  await screen.getByRole('form', 'New statement').getByRole('combobox', 'Checked by').tap();
  await expect(screen.getByRole('listbox').getByRole('option')).toHaveCount(3);
  await expect(screen.getByRole('option', 'D. LAZARO')).toBeVisible();
  await screen.getByRole('option', 'D. LAZARO').tap();
  await expect(screen.getByRole('article', /^Billing statement /).getByRole('img', 'Signature of D. LAZARO')).toBeVisible();

  await app.open('/#vouchers');
  await screen.getByRole('tab', /^Voucher entry/).tap();
  await expect(screen.getByRole('article', /^Check voucher /).getByRole('img', 'Signature of D. LAZARO')).toBeVisible();
  await expect(screen.getByRole('article', /^Check voucher /).getByRole('slider', 'Size of D. LAZARO\'s signature').first()).toHaveAttribute('aria-valuenow', '120');

  // Removed, it prints no more.
  await app.open('/#company');
  await screen.getByRole('region', 'Signatures').getByRole('button', 'Remove…').tap();
  const confirm = screen.getByRole('alertdialog', 'Remove the signature of D. LAZARO?');

  await confirm.getByRole('checkbox', 'I understand this can’t be undone').tap();
  await confirm.getByRole('button', 'Remove signature').tap();
  await expect(screen.getByRole('region', 'Signatures').getByText('No signatures yet. Documents leave the line to sign by hand.')).toBeVisible();
});
