import { test } from '@e2e-dev/web';
import { expect, type Screen } from 'e2e';

// Statements of Account (packages/modules/soa). The tests' sample records keep none, so a new one is SOA-2026-001. The
// lease filled in below is the company's form: 354.4 sqm at ₱600 a month, two months' deposit and two months' advance,
// the ₱212,640 reservation paid in cash, starting Jan 1, 2027 for two years at 5% a year, twelve BPI checks from
// 6000325749 paying February 2027 to January 2028.

async function fillLease(screen: Screen) {
  const form = screen.getByRole('form', 'New statement of account');

  await form.getByRole('textbox', 'Client').fill('Northwind Retail Corp.');
  await form.getByRole('textbox', 'Property address').fill('Unit 5, Ortigas Avenue, Pasig');
  await form.getByRole('textbox', 'Payee').fill('Juan Dela Cruz');
  await form.getByRole('textbox', 'Floor area (sqm)').fill('354.4');
  await form.getByRole('textbox', 'Rate per sqm').fill('600');
  await form.getByRole('textbox', 'Reservation paid').fill('212640');
  await form.getByRole('textbox', 'Reservation check no.').fill('CASH DEPOSIT');
  await form.getByRole('textbox', 'Contract commencement').fill('2027-01-01');
  await form.getByRole('textbox', 'Term (months)').fill('24');
  await form.getByRole('textbox', 'Escalation a year (%)').fill('5');
  await form.getByRole('textbox', 'First month paid by check').fill('2027-02');
  await form.getByRole('textbox', 'Number of checks').fill('12');
  await form.getByRole('textbox', 'Bank').fill('BPI');
  await form.getByRole('textbox', 'First check number').fill('6000325749');

  return form;
}

test('works out the rent, the deposit, each lease year and the checks, on the printed statement', async ({ app, screen }) => {
  await app.open('/#soa');

  await expect(screen.getByRole('heading', { name: 'Statements of Account', level: 1 })).toBeVisible();
  const form = await fillLease(screen);

  await expect(form.getByRole('textbox', 'SOA No.')).toHaveValue('SOA-2026-001');
  // ₱212,640 base rent; VAT 12% adds ₱25,516.80; EWT 5% takes ₱10,632 off.
  await expect(form.getByText('Base rent ₱212,640.00 · VAT ₱25,516.80 · EWT (₱10,632.00)')).toBeVisible();
  await expect(form.getByText('₱227,524.80 a month')).toBeVisible();
  // Two months' deposit (₱425,280) and advance (₱455,049.60), less the ₱212,640 reservation.
  await expect(form.getByText('Due on signing ₱667,689.60')).toBeVisible();

  const paper = screen.getByRole('article', 'Statement of account SOA-2026-001');

  await expect(paper.getByText('Northwind Retail Corp.', { exact: true })).toBeVisible();
  await expect(paper.getByText('2 years, 5% escalation a year from the second year')).toBeVisible();
  const breakdown = paper.getByRole('table', 'Breakdown');

  await expect(breakdown.getByRole('row', 'Base rent 354.4 ₱600.00 354.4 sqm × ₱600.00 ₱212,640.00')).toBeVisible();
  await expect(breakdown.getByRole('row', '12% VAT ₱212,640.00 × 12% ₱25,516.80')).toBeVisible();
  await expect(breakdown.getByRole('row', 'Less: 5% EWT ₱212,640.00 × 5% (₱10,632.00)')).toBeVisible();
  await expect(breakdown.getByRole('row', 'Monthly rent: base + VAT − EWT ₱227,524.80')).toBeVisible();

  const deposit = paper.getByRole('table', 'Deposit and advance');

  await expect(deposit.getByRole('row', 'Less: Reservation ₱212,640.00 1 (₱212,640.00) — CASH DEPOSIT')).toBeVisible();
  await expect(deposit.getByRole('row', /^Security deposit \(2 months base rent\) ₱212,640\.00 2 ₱425,280\.00/)).toBeVisible();
  await expect(deposit.getByRole('row', /^Advance rental \(2 months\) ₱227,524\.80 2 ₱455,049\.60/)).toBeVisible();
  await expect(paper.getByText('₱667,689.60')).toBeVisible();

  const years = paper.getByRole('table', 'Lease term and escalation');

  await expect(years.getByRole('row', /^1 Jan 1, 2027 – Dec 31, 2027 — ₱212,640\.00 .* ₱227,524\.80$/)).toBeVisible();
  await expect(years.getByRole('row', /^2 Jan 1, 2028 – Dec 31, 2028 5% ₱223,272\.00 .* ₱238,901\.04$/)).toBeVisible();

  const checks = paper.getByRole('table', 'Postdated checks');

  await expect(checks.getByRole('row')).toHaveCount(13);
  await expect(checks.getByRole('row', '1 February 28, 2027 BPI 6000325749 ₱227,524.80 February 2027 Rent')).toBeVisible();
  // The twelfth check pays the first month of the second year, at its escalated rent.
  await expect(checks.getByRole('row', '12 January 28, 2028 BPI 6000325760 ₱238,901.04 January 2028 Rent')).toBeVisible();
});

test('saves the statement to the register and the Activity Log, and opens it again', async ({ app, screen }) => {
  await app.open('/#soa');
  const form = await fillLease(screen);

  await form.getByRole('button', 'Save statement').tap();
  const register = screen.getByRole('table', 'Statements saved');

  await expect(register.getByRole('row', /^SOA-2026-001 Northwind Retail Corp\. Unit 5, Ortigas Avenue, Pasig Nov 2, 2026 ₱227,524\.80 ₱667,689\.60/)).toBeVisible();
  await expect(screen.getByRole('form', 'New statement of account').getByRole('textbox', 'SOA No.')).toHaveValue('SOA-2026-002');

  await register.getByRole('row', /^SOA-2026-001 /).getByText('Northwind Retail Corp.').tap();
  const editing = screen.getByRole('form', 'Editing SOA-2026-001');

  await expect(editing.getByRole('textbox', 'Floor area (sqm)')).toHaveValue('354.4');

  await app.open('/#activity');
  await screen.getByRole('group', 'Module').getByRole('button', 'Statements of Account').tap();
  await expect(screen.getByRole('region', 'Entries').getByText(/SOA-2026-001 for Northwind Retail Corp\., Unit 5, Ortigas Avenue, Pasig \(₱227,524\.80 a month, ₱667,689\.60 on signing\)/)).toBeVisible();
});

test('refuses a statement with no floor area, saying what is missing', async ({ app, screen }) => {
  await app.open('/#soa');
  const form = await fillLease(screen);

  await form.getByRole('textbox', 'Floor area (sqm)').fill('');
  await form.getByRole('button', 'Save statement').tap();

  await expect(form.getByRole('alert')).toHaveText('Enter the floor area in square metres.');
  await expect(screen.getByText('No statements of account yet.', { exact: true })).toBeVisible();
});

// Save draft (docs/adr/0041): a statement's work kept with the records and listed under Drafts above the saved ones,
// and opened again to be finished. Saved for real, it takes the next number and the draft leaves the list.
test('saves a draft, opens it again from Drafts, and takes it away once the statement is saved', async ({ app, screen }) => {
  await app.open('/#soa');
  const form = await fillLease(screen);

  await form.getByRole('button', 'Save draft').tap();
  await expect(screen.getByRole('dialog', 'Draft saved. Open it again from Drafts.')).toBeVisible();
  await expect(screen.getByText('No statements of account yet.', { exact: true })).toBeVisible();

  await screen.getByRole('button', 'New statement').tap();
  await expect(screen.getByRole('form', 'New statement of account').getByRole('textbox', 'Client')).toHaveValue('');
  await screen.getByRole('list', 'Drafts').getByRole('listitem', 'Northwind Retail Corp. · Unit 5, Ortigas Avenue, Pasig').getByRole('button', 'Open').tap();
  const opened = screen.getByRole('form', 'New statement of account');

  await expect(opened.getByRole('textbox', 'Floor area (sqm)')).toHaveValue('354.4');
  await expect(opened.getByRole('textbox', 'SOA No.')).toHaveValue('SOA-2026-001');
  await opened.getByRole('button', 'Save statement').tap();
  await expect(screen.getByRole('table', 'Statements saved').getByRole('row', /^SOA-2026-001 Northwind/)).toBeVisible();
  await expect(screen.getByRole('list', 'Drafts')).toBeHidden();
});
