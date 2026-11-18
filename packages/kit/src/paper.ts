// The paper every document is laid out for, written once: an A4 page and the margin the print stylesheet leaves around
// a document (packages/ui/src/styles.css › @page, which packages/kit/test/documents.test.tsx holds to these numbers).
// The preview's width, the print's printable area and the PDF's margin are all worked out from here.

/** An A4 page, and the margin printed around a document, in millimetres. */
export const PAPER = { width: 210, height: 297, margin: 12 } as const;

/** What is left of the page inside the margins, in millimetres: 186 × 273. */
export const PRINTABLE = { width: PAPER.width - 2 * PAPER.margin, height: PAPER.height - 2 * PAPER.margin } as const;

/** Millimetres as CSS px, 96 to the inch. */
export const mmToPx = (mm: number) => (mm / 25.4) * 96;

/** Millimetres as PDF points, 72 to the inch. */
export const mmToPt = (mm: number) => (mm / 25.4) * 72;

/** The paper's width in CSS px: an A4 page less the print margins (186 mm). */
export const PAPER_WIDTH = Math.round(mmToPx(PRINTABLE.width));

/** The paper's width on an A4 page turned on its side, less the same margins (273 mm): a sheet too wide to stand upright. */
export const LANDSCAPE_PAPER_WIDTH = Math.round(mmToPx(PRINTABLE.height));

/** A whole A4 page's width in CSS px (210 mm, rounded down so it never spills onto a second page): a two-up sheet prints with no margin. */
export const PAGE_WIDTH = Math.floor(mmToPx(PAPER.width));

/** Half an A4 page's height in CSS px (148.5 mm, rounded down): one copy on a two-up sheet, from an edge of the page to the middle, where it is cut. */
export const HALF_PAGE_HEIGHT = Math.floor(mmToPx(PAPER.height / 2));
