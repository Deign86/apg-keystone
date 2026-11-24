import { readFile } from 'node:fs/promises';
import { test, type Browser } from '@e2e-dev/web';
import { expect, type Screen } from 'e2e';
import { paperAsPrinted, pdfPlacements } from './support/paper';

// Every paper Keystone prints or saves as a PDF (packages/kit/src/paper.ts, output.ts) fills an A4 page: an upright
// one 186 mm across inside the 12 mm margins, the payroll sheet 273 mm across a page on its side, and the two-up
// voucher the whole sheet; each centred, nothing cut off, not shrunk to one side. A test per paper, on its own screen:
//   - the PDF as this browser saves it (drawn, docs/adr/0043): where each page puts the paper;
//   - the paper as Print lays it out, which is what the Windows app's PDF is: nothing else on the screen takes room
//     (a wide table beside it made the browser shrink the whole print, the paper narrower than A4 and off to one side),
//     and the paper starts at the page's edge at its full width.

const MARGIN = (12 / 25.4) * 72;
const A4 = { w: 595.28, h: 841.89 };

/** Exports the paper on screen with `button` and waits for `saved` to be said. */
async function exportPdf(browser: Browser, screen: Screen, button: string, saved: string) {
  const file = await browser.waitForDownload(async () => {
    await screen.getByRole('button', button).tap();
    await expect(screen.getByRole('dialog', saved)).toBeVisible({ timeout: 30_000 });
  });

  return pdfPlacements(await readFile(file.absolutePath));
}

/** Each page is A4 this way up, and the paper on it spans `across` points, centred, from the top of the page's room. */
function expectFilled(pages: ReturnType<typeof pdfPlacements>, way: 'portrait' | 'landscape', across: number, margin = MARGIN) {
  const page = way === 'portrait' ? A4 : { w: A4.h, h: A4.w };

  expect(pages.length).toBeGreaterThanOrEqual(1);

  for (const { page: size, paper } of pages) {
    expect(size.w).toBeCloseTo(page.w, 1);
    expect(size.h).toBeCloseTo(page.h, 1);
    expect(paper.w).toBeCloseTo(across, 0);
    // Centred: as much room on its left as on its right.
    expect(paper.x).toBeCloseTo((page.w - paper.w) / 2, 0);
    // From the top of the room on the page (a PDF counts up from the bottom), and inside it at the foot.
    expect(paper.y + paper.h).toBeCloseTo(page.h - margin, 0);
    expect(paper.y).toBeGreaterThanOrEqual(margin - 0.5);
  }
}

/** Laid out as Print lays it out: alone on the page, centred with nothing around it pushing it aside, at its full width. */
async function expectPrintedAlone(browser: Browser, label: string) {
  const printed = await paperAsPrinted(browser, label);

  expect(printed?.others).toEqual([]);
  expect(printed?.offCentre).toBe(0);
  expect(printed?.width).toBe(printed?.laidOut);
}

test('saves and prints a long statement of account across every A4 page it runs to', async ({ app, screen, browser }) => {
  await app.open('/#soa');
  const form = screen.getByRole('form', 'New statement of account');

  for (const [label, value] of [['Client', 'Northwind Retail Corp.'], ['Payee', 'Juan Dela Cruz'], ['Floor area (sqm)', '354.4'], ['Rate per sqm', '600'], ['Contract commencement', '2027-01-01'], ['Term (months)', '24'], ['Number of checks', '24'], ['Bank', 'BPI'], ['First check number', '6000325749']]) {
    await form.getByRole('textbox', label).fill(value);
  }

  const pages = await exportPdf(browser, screen, 'Export PDF', 'Saved SOA-2026-001.pdf.');

  expect(pages).toHaveLength(2);
  expectFilled(pages, 'portrait', A4.w - 2 * MARGIN);
  await expectPrintedAlone(browser, 'Statement of account');
});

test('saves and prints a billing statement across an A4 page', async ({ app, screen, browser }) => {
  await app.open('/#billing');
  await screen.getByRole('tab', /^Statement entry/).tap();
  const form = screen.getByRole('form', 'New statement');

  await form.getByRole('textbox', 'Line 1 description').fill('Virtual office, November');
  await form.getByRole('textbox', 'Line 1 unit price').fill('10000');

  expectFilled(await exportPdf(browser, screen, 'Export PDF', 'Saved 888-110226.pdf.'), 'portrait', A4.w - 2 * MARGIN);
  await expectPrintedAlone(browser, 'Billing statement');
});

test('saves and prints the two-up check voucher across the whole sheet', async ({ app, screen, browser }) => {
  await app.open('/#vouchers');
  await screen.getByRole('tab', /^Voucher entry/).tap();
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('textbox', 'Line 1 description').fill('Office supplies for November');
  await form.getByRole('textbox', 'Line 1 amount').fill('1250.50');

  // No margin: two half pages of 148.5 mm each, rounded down to whole pixels, so within 2 pt of the page's width.
  const pages = await exportPdf(browser, screen, 'Export PDF', 'Saved 888-001.pdf.');

  expect(pages).toHaveLength(1);
  expect(pages[0].paper.w).toBeGreaterThan(A4.w - 2);
  expectFilled(pages, 'portrait', pages[0].paper.w, 0);
  await expectPrintedAlone(browser, 'Check voucher');
});

test('saves and prints the payroll sheet across an A4 page on its side, and a payslip across an upright one', async ({ app, screen, browser }) => {
  await app.open('/#payroll');
  await screen.getByRole('table', 'Pay setup').getByRole('row', /Juan Miguel P\. Reyes/).tap();
  const pay = screen.getByRole('form', 'Pay setup for Juan Miguel P. Reyes');

  await pay.getByRole('textbox', 'Employee no.').fill('APGCO-0013');
  await pay.getByRole('textbox', 'Daily rate').fill('760');
  await pay.getByRole('button', 'Save pay setup').tap();
  await expect(screen.getByRole('article', 'Payroll sheet, Oct 16–31, 2026')).toBeVisible();

  expectFilled(await exportPdf(browser, screen, 'Export PDF', 'Saved Payroll Oct 16–31, 2026.pdf.'), 'landscape', A4.h - 2 * MARGIN);
  await expectPrintedAlone(browser, 'Payroll sheet');

  // The payslip sits beside the cut-off's wide tables: printed, it once came out at 71% of the page's width.
  await screen.getByRole('group', 'Show').getByRole('button', 'Payslip: Juan Miguel P. Reyes').tap();
  await expect(screen.getByRole('article', 'Payslip, Juan Miguel P. Reyes, Oct 16–31, 2026')).toBeVisible();

  expectFilled(await exportPdf(browser, screen, 'Export PDF', 'Saved Payslip Juan Miguel P. Reyes Oct 16–31, 2026.pdf.'), 'portrait', A4.w - 2 * MARGIN);
  await expectPrintedAlone(browser, 'Payslip');
});

test('prints a fund transfer request alone on its A4 page', async ({ app, screen, browser }) => {
  // Saving one as a PDF needs the CEO's approval, in the cloud (e2e/cloud/funds.e2e.ts): here, how it prints.
  await app.open('/#funds');
  await screen.getByRole('tab', /^Request entry/).tap();
  const form = screen.getByRole('form', 'New request');

  await form.getByRole('textbox', 'Line 1 description').fill('Pantry groceries');
  await form.getByRole('textbox', 'Line 1 amount').fill('3,250.75');
  await expect(screen.getByRole('article', /^Fund transfer request/)).toBeVisible();

  await expectPrintedAlone(browser, 'Fund transfer request');
});
