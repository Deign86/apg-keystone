import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LandscapePage } from '../src/documents';
import { savePdf } from '../src/output';
import { HALF_PAGE_HEIGHT, LANDSCAPE_PAGE, LANDSCAPE_PAPER_WIDTH, mmToPt, PAGE_WIDTH, pageCuts, PAPER, PAPER_WIDTH, pdfAcross, PDF_DPI, pdfPage, pdfPixelRatio, pdfScale, PRINTABLE, TWO_UP, UPRIGHT } from '../src/paper';

/** The @page rules in the document's head. */
const pageRules = () => [...document.head.querySelectorAll('style')].flatMap((s) => (s.textContent?.startsWith('@page') ? [s.textContent] : []));

const PRINTED = new TextEncoder().encode('%PDF-1.7');

describe('Export PDF, printed by the platform', () => {
  it('prints the paper as Print does, saves what the print gives back, and puts the page back', async () => {
    render(<LandscapePage label="Payroll sheet, Oct 16–31, 2026">Net pay</LandscapePage>);
    const paper = screen.getByRole('article', { name: 'Payroll sheet, Oct 16–31, 2026' });
    const during: [boolean, string[]][] = [];
    const save = vi.fn(async (name: string) => name);

    const printPdf = async () => {
      during.push([paper.hasAttribute('data-print-root'), pageRules()]);

      return PRINTED;
    };

    expect(await savePdf(paper, 'Payroll Oct 16–31, 2026.pdf', { save, printPdf })).toBe('Payroll Oct 16–31, 2026.pdf');
    // Only this paper prints, on its own landscape page: what the print stylesheet and its layout ask for.
    expect(during).toEqual([[true, ['@page { size: A4 landscape; }']]]);
    expect(save).toHaveBeenCalledWith('Payroll Oct 16–31, 2026.pdf', PRINTED, [{ name: 'PDF', extensions: ['pdf'] }]);
    expect(paper).not.toHaveAttribute('data-print-root');
    expect(pageRules()).toEqual([]);
  });

  it('puts the page back when the print fails, and saves nothing', async () => {
    render(<LandscapePage label="Payroll sheet, Nov 1–15, 2026">Net pay</LandscapePage>);
    const paper = screen.getByRole('article', { name: 'Payroll sheet, Nov 1–15, 2026' });
    const save = vi.fn(async (name: string) => name);

    await expect(savePdf(paper, 'Payroll.pdf', { save, printPdf: () => Promise.reject(new Error('Printing the page to a PDF took too long.')) })).rejects.toThrow('took too long');
    expect(save).not.toHaveBeenCalled();
    expect(paper).not.toHaveAttribute('data-print-root');
    expect(pageRules()).toEqual([]);
  });
});

// Where the platform cannot print a page to a PDF, Keystone draws the paper into one, as text, shapes and its real
// pictures, on A4 pages (packages/kit/src/paper-pdf.ts). jsdom lays nothing out, so these hold the numbers it is
// placed and scaled by; the file itself, its pages, its text and its pictures are checked end to end
// (e2e/papers.e2e.ts, and the modules' Export PDF tests).

/** The pixels across and down a picture as wide and tall as a paper this size, drawn for this layout's PDF. */
const drawn = (layout: typeof UPRIGHT, width: number, height: number) => {
  const ratio = pdfPixelRatio(layout, { width, height });

  return { across: Math.round(width * ratio), down: Math.round(height * ratio) };
};

/** Millimetres on paper, as pixels at the PDF's resolution. */
const atDpi = (mm: number) => Math.round((mm / 25.4) * PDF_DPI);

describe('Export PDF, drawn by Keystone', () => {
  it('draws its pictures (the logo, signatures) at print resolution', () => {
    // 300 dpi for the size a picture takes on the page: sharp on A4.
    expect(PDF_DPI).toBe(300);
  });

  it('sets each layout on its A4 page, which way up and inside the margin it asks for', () => {
    const a4 = { w: mmToPt(PAPER.width), h: mmToPt(PAPER.height) };

    expect(a4.w).toBeCloseTo(595.28, 1);
    expect(a4.h).toBeCloseTo(841.89, 1);
    expect(pdfPage(UPRIGHT)).toEqual({ page: a4, room: { w: mmToPt(PRINTABLE.width), h: mmToPt(PRINTABLE.height) } });
    expect(pdfPage(LANDSCAPE_PAGE)).toEqual({ page: { w: a4.h, h: a4.w }, room: { w: mmToPt(PRINTABLE.height), h: mmToPt(PRINTABLE.width) } });
    // A two-up sheet fills the whole page, as it prints.
    expect(pdfPage(TWO_UP)).toEqual({ page: a4, room: a4 });
  });

  it('draws an upright paper across the page, however long it is: it runs onto more pages', () => {
    expect(UPRIGHT.pdf.flow).toBe(true);
    // A billing statement shorter than a page, and a statement of account twice as long: both 186 mm across, as printed.
    expect(drawn(UPRIGHT, PAPER_WIDTH, 930).across).toBe(atDpi(PRINTABLE.width));
    expect(drawn(UPRIGHT, PAPER_WIDTH, 2000).across).toBe(atDpi(PRINTABLE.width));
    // 1 CSS px is 0.75 pt there, as it prints at 96 px to the inch: the PDF is the size the print is.
    expect(pdfScale(UPRIGHT, { width: PAPER_WIDTH, height: 2000 })).toBeCloseTo(0.75, 2);
  });

  it('spans the page inside its margins, and centres a paper fitted to one page by its height', () => {
    const margin = mmToPt(PAPER.margin);

    // An upright paper, however long: the full 186 mm, from the left margin.
    expect(pdfAcross(UPRIGHT, { width: PAPER_WIDTH, height: 2000 }).x).toBeCloseTo(margin);
    expect(pdfAcross(UPRIGHT, { width: PAPER_WIDTH, height: 2000 }).width).toBeCloseTo(mmToPt(PRINTABLE.width));
    // A short payroll sheet spans the landscape page's 273 mm; a long one shrinks to its height and stays centred.
    expect(pdfAcross(LANDSCAPE_PAGE, { width: LANDSCAPE_PAPER_WIDTH, height: 340 }).width).toBeCloseTo(mmToPt(PRINTABLE.height));
    const long = pdfAcross(LANDSCAPE_PAGE, { width: LANDSCAPE_PAPER_WIDTH, height: 1400 });

    expect(long.width).toBeLessThan(mmToPt(PRINTABLE.height));
    expect(long.x - margin).toBeCloseTo(mmToPt(PAPER.height) - margin - (long.x + long.width));
  });

  it('fits a two-up voucher and a payroll sheet to one page', () => {
    expect([TWO_UP.pdf.flow, LANDSCAPE_PAGE.pdf.flow]).toEqual([undefined, undefined]);
    // Two half pages, each rounded down to whole px: within a few pixels of the page's 210 mm.
    expect(drawn(TWO_UP, PAGE_WIDTH, 2 * HALF_PAGE_HEIGHT).across).toBeCloseTo(atDpi(PAPER.width), -1);
    expect(drawn(LANDSCAPE_PAGE, LANDSCAPE_PAPER_WIDTH, 340).across).toBe(atDpi(PRINTABLE.height));
    // A sheet longer than its page shrinks to fit it, by its height.
    expect(drawn(LANDSCAPE_PAGE, LANDSCAPE_PAPER_WIDTH, 1400).down).toBe(atDpi(PRINTABLE.width));
  });

  it('draws a paper narrower than the page as wide as the page, its pictures with more pixels to match', () => {
    // Scaled up to fit: a picture on it is drawn with more pixels, not blown up from fewer.
    expect(drawn(UPRIGHT, 520, 380).across).toBe(atDpi(PRINTABLE.width));
  });
});

describe('the pages a long paper is cut into', () => {
  it('leaves a paper that fits on one page whole', () => {
    expect(pageCuts(900, 1000, [])).toEqual([0, 900]);
    // Half a pixel over is rounding, not a second page.
    expect(pageCuts(1000.4, 1000, [])).toEqual([0, 1000.4]);
  });

  it('cuts between rows, never through one', () => {
    // Rows 40 px tall, from 10 down: a 1000 px page ends inside the row from 970 to 1010.
    const rows = Array.from({ length: 60 }, (_, i): [number, number] => [i * 40 + 10, i * 40 + 50]);
    const cuts = pageCuts(2410, 1000, rows);

    expect(cuts[0]).toBe(0);
    expect(cuts.at(-1)).toBe(2410);

    for (const cut of cuts.slice(1, -1)) expect(rows.some(([top, bottom]) => top < cut && bottom > cut), `cut at ${cut}`).toBe(false);
    // As low on each page as a row allows: the row from 970 to 1010 starts the second page, which ends at a row's foot.
    expect(cuts.slice(1, -1)).toEqual([970, 1970]);

    // Every page fits.
    for (let i = 1; i < cuts.length; i++) expect(cuts[i] - cuts[i - 1]).toBeLessThanOrEqual(1000);
  });

  it('moves a cut above a line of text inside a block that is itself kept, and above that block', () => {
    // A signature block from 900 to 1100, with a line of text from 980 to 1000 in it.
    expect(pageCuts(1500, 1000, [[980, 1000], [900, 1100]])).toEqual([0, 900, 1500]);
  });

  it('cuts something taller than a page where the page ends, as Print would', () => {
    // A picture 1200 px tall cannot stay whole on a 1000 px page: no near-empty first page for it.
    expect(pageCuts(1500, 1000, [[50, 1250]])).toEqual([0, 1000, 1500]);
  });
});
