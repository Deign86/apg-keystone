import { readFile } from 'node:fs/promises';
import { test, type Browser } from '@e2e-dev/web';
import { expect } from 'e2e';
import { markedPaperParts, pdfPages, PDF_MOST_BYTES_A_PAGE } from '../support/paper';
import { pickSignatory } from '../support/signatory';

// Writing, keeping and printing a document on a phone and a tablet, as on the desktop: the form, Save draft and the
// draft kept by itself, the paper under the form scaled to fit the screen with the part being typed marked on it,
// Print, Export PDF (drawn A4 pages, the browser's way), and a signature over its line, resized by a finger.

/** How wide the paper shows next to the screen it is on: it is scaled to fit, never cut off or scrolled. */
function paperFit(browser: Browser, label: string) {
  return browser.evaluate((name: string) => {
    const paper = document.querySelector<HTMLElement>(`[aria-label="${name}"]`)!;
    const shown = paper.getBoundingClientRect();
    const main = document.getElementById('main')!.getBoundingClientRect();

    return { inside: shown.left >= main.left && shown.right <= main.right + 0.5, scaled: shown.width < paper.offsetWidth };
  }, label);
}

test('writes a voucher by touch, saves a draft, keeps what is typed by itself, and routes it for approval', async ({ app, screen, browser }) => {
  await app.open('/#vouchers');
  await screen.getByRole('tab', /^Voucher entry/).tap();
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('textbox', 'Payee').fill('Manila Electric Company (Meralco)');
  await form.getByRole('textbox', 'Line 1 description').fill('Office supplies for November');
  await form.getByRole('textbox', 'Line 1 amount').fill('1250.50');
  await form.getByRole('button', 'Add line').tap();
  await form.getByRole('textbox', 'Line 2 description').fill('Courier');
  await form.getByRole('textbox', 'Line 2 amount').fill('250');
  await expect(form.getByText('₱1,500.50')).toBeVisible();

  await form.getByRole('button', 'Save draft').tap();
  await expect(screen.getByRole('dialog', 'Draft saved. Open it again from Drafts.')).toBeVisible();

  // Typed and closed at once, as a phone puts a page away: the draft keeps it.
  await form.getByRole('textbox', 'Address').fill('Ortigas Ave., Pasig City');
  await expect(form.getByText(/^Draft saved \d\d:\d\d$/)).toBeVisible();
  await browser.evaluate(() => { location.reload(); });

  await screen.getByRole('tab', /^Voucher register/).tap();
  await screen.getByRole('list', 'Drafts').getByRole('listitem', 'MANILA ELECTRIC COMPANY (MERALCO) · ₱1,500.50').getByRole('button', 'Open').tap();
  const opened = screen.getByRole('form', 'New voucher');

  await expect(opened.getByRole('textbox', 'Address')).toHaveValue('Ortigas Ave., Pasig City');
  await opened.getByRole('button', 'Save and route for approval').tap();
  await expect(screen.getByRole('dialog', '888001 saved and routed for approval.')).toBeVisible();

  // The register scrolls sideways in its own box on a phone, every value whole; the row's menu takes a tap.
  await screen.getByRole('tab', /^Voucher register/).tap();
  const register = screen.getByRole('table', 'Voucher register');

  await expect(register.getByRole('row', /^888001 Nov 2, 2026 MANILA ELECTRIC COMPANY \(MERALCO\).*₱1,500\.50 For Approval/)).toBeVisible();
  await register.getByRole('button', 'Actions for 888001').tap();
  await screen.getByRole('menuitem', 'Mark approved').tap();
  await expect(register.getByRole('row', /^888001 /).getByRole('cell', 'Approved')).toBeVisible();
});

test('shows the paper under the form scaled to fit, and marks on it where the field being typed in prints', async ({ app, screen, browser }) => {
  await app.open('/#vouchers');
  await screen.getByRole('tab', /^Voucher entry/).tap();
  const form = screen.getByRole('form', 'New voucher');

  await form.getByRole('textbox', 'Payee').fill('Manila Electric Company (Meralco)');
  const paper = screen.getByRole('article', 'Check voucher 888001');

  await expect(paper).toBeVisible();
  expect(await paperFit(browser, 'Check voucher 888001')).toEqual({ inside: true, scaled: true });
  // Both copies mark the payee while its field has focus.
  await expect.poll(() => markedPaperParts(browser)).toEqual([
    'PAYEE MANILA ELECTRIC COMPANY (MERALCO) · solid 2px',
    'PAYEE MANILA ELECTRIC COMPANY (MERALCO) · solid 2px',
  ]);
});

test('prints a statement and saves it as a PDF of A4 pages, from a phone or tablet browser', async ({ app, screen, browser }) => {
  await app.open('/#billing');
  await screen.getByRole('tab', /^Statement entry/).tap();
  const form = screen.getByRole('form', 'New statement');

  await form.getByRole('textbox', 'Bill to').fill('Springfield Properties Inc.');
  await form.getByRole('textbox', 'Line 1 description').fill('Property management, November');
  await form.getByRole('textbox', 'Line 1 unit price').fill('25000');

  // Print hands the browser the paper alone: the page marks it as what prints while the print dialog is open.
  await browser.evaluate(() => {
    window.print = () => {
      const printing = document.querySelector('[data-print-root]')?.getAttribute('aria-label') ?? 'nothing';

      document.body.append(Object.assign(document.createElement('output'), { textContent: `Printed ${printing}` }));
      dispatchEvent(new Event('afterprint'));
    };
  });
  await form.getByRole('button', 'Print').tap();
  await expect(screen.getByText('Printed Billing statement 888110226')).toBeVisible();

  const file = await browser.waitForDownload(async () => {
    await form.getByRole('button', 'Export PDF').tap();
    await expect(screen.getByRole('dialog', 'Saved 888110226.pdf.')).toBeVisible({ timeout: 20_000 });
  });

  const pdf = await readFile(file.absolutePath);

  expect(file.suggestedFilename).toBe('888110226.pdf');
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  const pages = pdfPages(pdf);

  // Upright A4 pages, 595.28 × 841.89 points, whatever the size of the screen it was saved on.
  expect(pages.length).toBeGreaterThanOrEqual(1);
  expect(pages.every((p) => Math.abs(p.w - 595.28) < 0.1 && Math.abs(p.h - 841.89) < 0.1)).toBe(true);
  expect(pdf.length).toBeLessThan(PDF_MOST_BYTES_A_PAGE * pages.length);
});

test('draws a signature with a finger, then moves and resizes it on the paper by dragging its frame, which shows without a hover', async ({ app, screen, browser }) => {
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
  const statement = screen.getByRole('article', /^Billing statement /);
  const frame = statement.getByRole('slider', "Size of D. Lazaro's signature");

  await expect(statement.getByRole('img', 'Signature of D. Lazaro')).toBeVisible();
  await expect(frame).toHaveAttribute('aria-valuenow', '100');
  // A finger has no hover: the frame always shows on a touch screen.
  expect(await browser.evaluate(() => getComputedStyle(document.querySelector('[role="slider"]')!).opacity)).toBe('1');

  /** Drags by a finger from (x, y) to (x + dx, y + dy), in steps, as the pointer events a touch makes. */
  const drag = async (x: number, y: number, dx: number, dy: number) => {
    await browser.mouse.move(x, y);
    await browser.mouse.down();
    await browser.mouse.move(x + dx / 2, y + dy / 2);
    await browser.mouse.move(x + dx, y + dy);
    await browser.mouse.up();
  };

  // Dragged by its middle, it moves off its place on the line.
  await frame.scrollIntoView();
  let at = (await frame.boundingBox())!;

  await drag(at.x + at.width / 2, at.y + at.height / 2, 10, -6);
  await expect(frame).toHaveAttribute('aria-valuetext', /moved/);

  // Dragged out by its top right corner, it grows, on every paper it is on.
  at = (await frame.boundingBox())!;
  await drag(at.x + at.width, at.y, 24, -24);
  await expect(frame).not.toHaveAttribute('aria-valuenow', '100');
  const grown = Number(await frame.getAttribute('aria-valuenow'));

  expect(grown).toBeGreaterThan(100);
  await app.open('/#vouchers');
  await screen.getByRole('tab', /^Voucher entry/).tap();
  await expect(screen.getByRole('article', /^Check voucher /).getByRole('slider', "Size of D. LAZARO's signature").first()).toHaveAttribute('aria-valuenow', String(grown));
});
