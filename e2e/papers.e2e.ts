import { readFile } from 'node:fs/promises';
import { test, type Browser } from '@e2e-dev/web';
import { expect, type Screen } from 'e2e';
import { expectCleanPdf, paperAsPrinted, paperInks, readPdf, runsDown } from './support/paper';
import { pickSignatory } from './support/signatory';

// Every paper Keystone prints or saves as a PDF (packages/kit/src/paper.ts, output.ts, paper-pdf.ts), on every
// platform, docs/adr/0043. A test per paper, on its own screen:
//   - the PDF as this browser saves it, read as a PDF reader reads it (pdf.js): each page A4; the paper drawn across the
//     printable width (186 mm upright, 273 mm on its side, the whole sheet for the two-up voucher), centred; its words
//     and peso amounts there as text, which can be selected, searched and edited; and its only images real pictures
//     (the logo), never a picture of the page; and as clean as the paper (docs/adr/0048, "Every exported PDF"): its
//     borders as lines, each in its colour on screen and drawn once, no rule stitched from pieces, no seam between two
//     backgrounds, and no frame;
//   - the paper as Print lays it out, which is what the Windows app's PDF is: nothing else on the screen takes room
//     (a wide table beside it made the browser shrink the whole print, the paper narrower than A4 and off to one side),
//     and the paper starts at the page's edge at its full width.

const MARGIN = (12 / 25.4) * 72;
const A4 = { w: 595.28, h: 841.89 };

/** Exports the paper on screen with `button`, waits for `saved` to be said, reads the PDF, and checks it is clean. */
async function exportPdf(browser: Browser, screen: Screen, button: string, saved: string) {
  const inks = await paperInks(browser);

  const file = await browser.waitForDownload(async () => {
    await screen.getByRole('button', button).tap();
    await expect(screen.getByRole('dialog', saved)).toBeVisible({ timeout: 30_000 });
  });

  const pages = await readPdf(await readFile(file.absolutePath));

  expect(pages.every((p) => p.lines.length > 0)).toBe(true);
  expectCleanPdf(pages, inks);

  return pages;
}

/** The text of every page, with letter-spaced words (headings set wide) closed up, as a search would match them. */
const words = (pages: Awaited<ReturnType<typeof readPdf>>) => pages.map((p) => p.text).join(' ');
const squeezed = (pages: Awaited<ReturnType<typeof readPdf>>) => words(pages).replace(/\s+/g, '');

/**
 * Each page is A4 this way up; what is drawn on it spans `across` points, centred, from the top of the page's room;
 * and its images are pictures on the paper (each under a tenth of the page), not the page drawn as one.
 */
function expectFilled(pages: Awaited<ReturnType<typeof readPdf>>, way: 'portrait' | 'landscape', across: number, margin = MARGIN) {
  const size = way === 'portrait' ? A4 : { w: A4.h, h: A4.w };

  expect(pages.length).toBeGreaterThanOrEqual(1);

  for (const [i, page] of pages.entries()) {
    expect(page.w).toBeCloseTo(size.w, 0);
    expect(page.h).toBeCloseTo(size.h, 0);
    // Within a point: across the printable width, centred, as much room on its left as on its right.
    expect(Math.abs(page.drawn.x1 - page.drawn.x0 - across)).toBeLessThan(1);
    expect(Math.abs(page.drawn.x0 - (page.w - page.drawn.x1))).toBeLessThan(1);

    // The paper starts at the top of the room on the page (a PDF counts up from the bottom).
    if (i === 0) expect(Math.abs(page.drawn.y1 - (page.h - margin))).toBeLessThan(1);

    expect(page.drawn.y0).toBeGreaterThanOrEqual(margin - 1);
    expect(page.text.trim().length).toBeGreaterThan(0);

    for (const image of page.images) expect(image.w * image.h).toBeLessThan((page.w * page.h) / 10);
  }
}

/** Laid out as Print lays it out: alone on the page, centred with nothing around it pushing it aside, at its full width. */
async function expectPrintedAlone(browser: Browser, label: string) {
  const printed = await paperAsPrinted(browser, label);

  expect(printed?.others).toEqual([]);
  expect(printed?.offCentre).toBe(0);
  expect(printed?.width).toBe(printed?.laidOut);
}

test('saves and prints a long statement of account across every A4 page it runs to, with its text', async ({ app, screen, browser }) => {
  await app.open('/#soa');
  const form = screen.getByRole('form', 'New statement of account');

  for (const [label, value] of [['Client', 'Northwind Retail Corp.'], ['Payee', 'Juan Dela Cruz'], ['Floor area (sqm)', '354.4'], ['Rate per sqm', '600'], ['Contract commencement', '2027-01-01'], ['Term (months)', '24'], ['Number of checks', '24'], ['Bank', 'BPI'], ['First check number', '6000325749']]) {
    await form.getByRole('textbox', label).fill(value);
  }

  const pages = await exportPdf(browser, screen, 'Export PDF', 'Saved SOA-2026-001.pdf.');

  expect(pages).toHaveLength(2);
  expectFilled(pages, 'portrait', A4.w - 2 * MARGIN);
  expect(squeezed(pages)).toContain('STATEMENTOFACCOUNT');
  expect(words(pages)).toContain('NORTHWIND RETAIL CORP.');
  expect(words(pages)).toContain('₱212,640.00');
  // The second page's checks are text too: the last one's number, after the cut.
  expect(pages[1].text).toContain('6000325772');
  // Its ruled table as the page rules it: the paper's ink round it, its light grey between columns, its pale grey between
  // rows, each 1 px (¾ pt), in exactly those colours; each column's rule one line down the page, not a piece a row.
  const rules = pages[1].lines;
  const columns = rules.filter((l) => runsDown(l) && l.color === '#9a9a9a');

  expect([...new Set(rules.map((l) => l.color))].sort()).toEqual(['#111111', '#9a9a9a', '#e3e3e3']);
  expect(new Set(rules.map((l) => l.width.toFixed(2)))).toEqual(new Set(['0.75']));
  expect(columns).toHaveLength(5);
  expect(new Set(columns.map((l) => `${l.y0.toFixed(1)} ${l.y1.toFixed(1)}`)).size).toBe(1);
  await expectPrintedAlone(browser, 'Statement of account');
});

test('saves and prints a billing statement across an A4 page, with its text', async ({ app, screen, browser }) => {
  await app.open('/#billing');
  await screen.getByRole('tab', /^Statement entry/).tap();
  const form = screen.getByRole('form', 'New statement');

  await form.getByRole('textbox', 'Line 1 description').fill('Virtual office, November');
  await form.getByRole('textbox', 'Line 1 unit price').fill('10000');

  const pages = await exportPdf(browser, screen, 'Export PDF', 'Saved 888-110226.pdf.');

  expectFilled(pages, 'portrait', A4.w - 2 * MARGIN);
  expect(squeezed(pages)).toContain('BILLINGSTATEMENT');
  expect(words(pages)).toContain('Virtual office, November');
  expect(words(pages)).toContain('₱10,000.00');
  await expectPrintedAlone(browser, 'Billing statement');
});

test('saves a signature over its line as a picture, the rest of the statement as text', async ({ app, screen, browser }) => {
  // D. Lazaro's signature, drawn once, signs the statements they prepare.
  await app.open('/#company');
  const panel = screen.getByRole('region', 'Signatures');

  await pickSignatory(screen, panel, 'Whose signature', 'D. Lazaro');
  await panel.getByRole('button', 'Draw signature…').tap();
  const pad = screen.getByRole('dialog', 'Signature of D. Lazaro');

  await pad.getByRole('img', 'Sign here').dragTo(pad.getByRole('button', 'Clear'));
  await pad.getByRole('button', 'Save signature').tap();
  await expect(screen.getByRole('dialog', 'Signature for D. Lazaro added.')).toBeVisible();

  await app.open('/#billing');
  await screen.getByRole('tab', /^Statement entry/).tap();
  await expect(screen.getByRole('article', /^Billing statement /).getByRole('img', 'Signature of D. Lazaro')).toBeVisible();
  await screen.getByRole('form', 'New statement').getByRole('textbox', 'Line 1 description').fill('Virtual office, November');

  const pages = await exportPdf(browser, screen, 'Export PDF', 'Saved 888-110226.pdf.');

  // The logo and the signature: two pictures, each a small part of the page; the name under the signature is text.
  expectFilled(pages, 'portrait', A4.w - 2 * MARGIN);
  expect(pages[0].images).toHaveLength(2);
  expect(words(pages)).toContain('D. Lazaro');
});

test('saves and prints the two-up check voucher across the whole sheet, with its text', async ({ app, screen, browser }) => {
  await app.open('/#vouchers');
  await screen.getByRole('tab', /^Voucher entry/).tap();
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('textbox', 'Line 1 description').fill('Office supplies for November');
  await form.getByRole('textbox', 'Line 1 amount').fill('1250.50');

  // No margin: the dashed line between the copies runs from edge to edge.
  const pages = await exportPdf(browser, screen, 'Export PDF', 'Saved 888-001.pdf.');

  expect(pages).toHaveLength(1);
  expectFilled(pages, 'portrait', pages[0].drawn.x1 - pages[0].drawn.x0, 0);
  expect(pages[0].drawn.x1 - pages[0].drawn.x0).toBeGreaterThan(A4.w - 2);
  // Both copies, as text.
  expect(squeezed(pages).split('CHECKVOUCHER')).toHaveLength(3);
  expect(words(pages).split('Office supplies for November')).toHaveLength(3);
  expect(words(pages)).toContain('₱1,250.50');
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

  const sheet = await exportPdf(browser, screen, 'Export PDF', 'Saved Payroll Oct 16–31, 2026.pdf.');

  expectFilled(sheet, 'landscape', A4.h - 2 * MARGIN);
  expect(words(sheet)).toContain('Juan Miguel P. Reyes');
  expect(words(sheet)).toContain('APGCO-0013');
  await expectPrintedAlone(browser, 'Payroll sheet');

  // The payslip sits beside the cut-off's wide tables: printed, it once came out at 71% of the page's width.
  await screen.getByRole('group', 'Show').getByRole('button', 'Payslip: Juan Miguel P. Reyes').tap();
  await expect(screen.getByRole('article', 'Payslip, Juan Miguel P. Reyes, Oct 16–31, 2026')).toBeVisible();

  const slip = await exportPdf(browser, screen, 'Export PDF', 'Saved Payslip Juan Miguel P. Reyes Oct 16–31, 2026.pdf.');

  expectFilled(slip, 'portrait', A4.w - 2 * MARGIN);
  expect(squeezed(slip)).toContain('PAYSLIP');
  expect(words(slip)).toContain('Juan Miguel P. Reyes');
  expect(words(slip)).toContain('₱760.00');
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
