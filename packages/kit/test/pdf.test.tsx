import { describe, expect, it } from 'vitest';
import { HALF_PAGE_HEIGHT, LANDSCAPE_PAGE, LANDSCAPE_PAPER_WIDTH, mmToPt, PAGE_WIDTH, PAPER, PAPER_WIDTH, PDF_DPI, pdfPage, pdfPixelRatio, PRINTABLE, TWO_UP, UPRIGHT } from '../src/paper';

// Export PDF draws the paper as one image and sets it on an A4 page (packages/kit/src/output.ts › savePdf). jsdom
// draws nothing, so these hold the numbers it is drawn to; the file itself, its page and its size are checked end to
// end (e2e/modules/vouchers.e2e.ts, billing, payroll, id-maker, and e2e/cloud/funds.e2e.ts).

/** The pixels across and down the image of a paper this size, drawn for this layout's PDF. */
const drawn = (layout: typeof UPRIGHT, width: number, height: number) => {
  const ratio = pdfPixelRatio(layout, { width, height });

  return { across: Math.round(width * ratio), down: Math.round(height * ratio) };
};

/** Millimetres on paper, as pixels at the PDF's resolution. */
const atDpi = (mm: number) => Math.round((mm / 25.4) * PDF_DPI);

describe('Export PDF', () => {
  it('draws at print resolution: sharp on A4, without the tens of megabytes 4× made', () => {
    // 300 dpi, where 4× drew an upright paper at about 380 dpi, and jsPDF stored every pixel raw.
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

  it('draws an upright paper 186 mm across at 300 dpi, and one longer than the page 273 mm down', () => {
    // A billing statement, shorter than the page: fitted by its width.
    expect(drawn(UPRIGHT, PAPER_WIDTH, 930).across).toBe(atDpi(PRINTABLE.width));
    // A statement of account, longer than the page: fitted by its height, and still 300 dpi where it lands.
    const soa = drawn(UPRIGHT, PAPER_WIDTH, 1180);

    expect(soa.down).toBe(atDpi(PRINTABLE.height));
    expect(soa.across / (PAPER_WIDTH * (mmToPt(PRINTABLE.height) / 1180) / 72)).toBeCloseTo(PDF_DPI);
  });

  it('draws a two-up voucher across the whole page, and the payroll sheet across a page on its side, at 300 dpi', () => {
    // Two half pages, each rounded down to whole px: within a few pixels of the page's 210 mm.
    expect(drawn(TWO_UP, PAGE_WIDTH, 2 * HALF_PAGE_HEIGHT).across).toBeCloseTo(atDpi(PAPER.width), -1);
    expect(drawn(LANDSCAPE_PAGE, LANDSCAPE_PAPER_WIDTH, 340).across).toBe(atDpi(PRINTABLE.height));
  });

  it('draws a small paper, such as an ID card sheet, as large as it shows on the page, at 300 dpi', () => {
    // Narrower than the page, so it is scaled up to fit: drawn with more pixels, not blown up from fewer.
    expect(drawn(UPRIGHT, 520, 380).across).toBe(atDpi(PRINTABLE.width));
  });
});
