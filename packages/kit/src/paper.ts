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

// How a sheet sits on the page. Each layout is defined once, here: its width, the marks the paper carries so Print and
// Export PDF know which layout it is, the @page rule for its print, how it is fitted to the page before printing and
// put back after, and how its PDF page is set up. documents.tsx renders a sheet from one of these; output.ts reads the
// same one back from the paper it is handed. Neither branches on which paper it is.

/** The marks a paper may carry, as data attributes. The print stylesheet names the last three (packages/ui/src/styles.css). */
export const MARKS = {
  /** How the paper is fitted to the page: `data-print-fit`. */
  fit: 'data-print-fit',
  /** Which way up the page is: `data-print-orientation`. */
  orientation: 'data-print-orientation',
  /** One copy on a sheet that holds the document more than once. */
  copy: 'data-sheet-copy',
  /** The one element being printed, while it prints: everything else is hidden. */
  printRoot: 'data-print-root',
  /** The frame that clips the scaled preview, and the wrapper that scales it. Print undoes both. */
  frame: 'data-sheet-frame',
  scale: 'data-sheet-scale',
} as const;

export interface PaperLayout {
  /** The paper's width, on screen and in print, in CSS px. */
  width: number;
  /** What the paper carries so Print and Export PDF find this layout again. */
  marks: { fit?: 'page' | 'halves'; orientation?: 'landscape' };
  /** The @page rule for this print only, over the stylesheet's upright A4 with margins. None: the stylesheet's stands. */
  page?: string;
  /** Fits the paper to the page just before it prints, and puts it back once the print is done. */
  fit?(paper: HTMLElement): void;
  unfit?(paper: HTMLElement): void;
  /** The PDF page: which way up, its margin in points, and anything the drawn copy of the paper needs changed. */
  pdf: { orientation: 'portrait' | 'landscape'; margin: number; style?: Partial<CSSStyleDeclaration> };
}

/** An upright A4 page inside the print margins: the paper as tall as what it holds. */
export const UPRIGHT: PaperLayout = { width: PAPER_WIDTH, marks: {}, pdf: { orientation: 'portrait', margin: mmToPt(PAPER.margin) } };

/**
 * An A4 page turned on its side, for a sheet too wide to stand upright, scaled to a single page however long it is.
 * Only by its height, measured as laid out at the page's width, and less 2% so borders and rounding never push the
 * last line onto a second page: the paper is already the page's width, and anything wider shrinks inside it
 * (FitWidth), on screen as in print.
 */
export const LANDSCAPE_PAGE: PaperLayout = {
  width: LANDSCAPE_PAPER_WIDTH,
  marks: { fit: 'page', orientation: 'landscape' },
  page: '@page { size: A4 landscape; }',
  fit(paper) {
    const page = { w: mmToPx(PRINTABLE.height), h: mmToPx(PRINTABLE.width) * 0.98 };
    const width = paper.style.width;

    paper.style.width = `${page.w}px`;
    const height = paper.scrollHeight;
    paper.style.width = width;
    const zoom = Math.min(1, page.h / height);

    if (zoom < 1) paper.style.zoom = String(zoom);
  },
  unfit(paper) {
    paper.style.zoom = '';
  },
  pdf: { orientation: 'landscape', margin: mmToPt(PAPER.margin) },
};

/** How far a two-up sheet's copies keep in from the paper's edges and the cut: inside what any printer reaches. */
export const TWO_UP_EDGE = '6mm';

/** The copies on a sheet that holds the document more than once. */
const copiesOf = (paper: HTMLElement) => [...paper.querySelectorAll<HTMLElement>(`[${MARKS.copy}]`)];

/**
 * The document twice on one upright A4, once on each half, out to near the paper's edges with no print margin, and a
 * dashed line across the middle: one cut leaves two copies. Each copy is fitted to exactly half the page, shrinking
 * one that runs longer, so the line falls at the middle, where the page is cut.
 */
export const TWO_UP: PaperLayout = {
  width: PAGE_WIDTH,
  marks: { fit: 'halves' },
  page: '@page { size: A4; margin: 0; }',
  fit(paper) {
    for (const copy of copiesOf(paper)) {
      const zoom = Math.min(1, HALF_PAGE_HEIGHT / copy.scrollHeight);

      if (zoom < 1) copy.style.zoom = String(zoom);
      copy.style.height = `${HALF_PAGE_HEIGHT / zoom}px`;
    }
  },
  unfit(paper) {
    for (const copy of copiesOf(paper)) {
      copy.style.zoom = '';
      copy.style.height = '';
    }
  },
  // The frame marks the paper's edge on screen only. The copy html-to-image draws keeps the frame's sides as
  // border-inline, which `border: 0` alone leaves in place: two lines down the page's edges, printed when it is fit.
  pdf: { orientation: 'portrait', margin: 0, style: { border: '0', borderInline: '0', borderBlock: '0' } },
};

const LAYOUTS = [TWO_UP, LANDSCAPE_PAGE, UPRIGHT];

/** The layout a paper was rendered with, read back from the marks it carries. */
export const layoutOf = (paper: HTMLElement): PaperLayout =>
  LAYOUTS.find((l) => l.marks.fit === paper.dataset.printFit && l.marks.orientation === paper.dataset.printOrientation) ?? UPRIGHT;
