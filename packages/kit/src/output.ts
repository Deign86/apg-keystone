import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { layoutOf, MARKS, mmToPt, mmToPx, PAPER, PRINTABLE } from './paper';
import type { Files } from './context';

/** The print stylesheet's page margin in PDF points. */
const MARGIN_PT = mmToPt(PAPER.margin);

/** Whether a document is laid out on an A4 page turned on its side (a Sheet with orientation="landscape"). */
const isLandscape = (node: HTMLElement) => node.dataset.printOrientation === 'landscape';

/**
 * Renders a document element to an A4 PDF (sharp at 4×, about 380 dpi on A4) and asks where to save it, on a landscape
 * page for a landscape sheet, with what its layout asks of the PDF: a two-up sheet fills the whole page, as it prints,
 * a copy on each half and the dashed line between them.
 */
export async function savePdf(node: HTMLElement, name: string, files: Pick<Files, 'save'>): Promise<string | null> {
  // A paper that is not on a layout of its own yet (the payroll sheet) prints and saves inside the page's margins.
  const { margin, style } = node.dataset.printFit === 'page' ? { margin: MARGIN_PT, style: undefined } : layoutOf(node).pdf;
  const png = await toPng(node, { pixelRatio: 4, backgroundColor: getComputedStyle(node).backgroundColor || '#ffffff', cacheBust: true, style });
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: isLandscape(node) ? 'landscape' : 'portrait' });
  const page = { w: pdf.internal.pageSize.getWidth(), h: pdf.internal.pageSize.getHeight() };
  const room = { w: page.w - margin * 2, h: page.h - margin * 2 };
  const img = pdf.getImageProperties(png);
  const scale = Math.min(room.w / img.width, room.h / img.height);

  pdf.addImage(png, 'PNG', margin, margin, img.width * scale, img.height * scale);

  const bytes = new Uint8Array(pdf.output('arraybuffer'));

  return files.save(name, bytes, [{ name: 'PDF', extensions: ['pdf'] }]);
}

/**
 * The printable area of an A4 page inside the print stylesheet's margins (upright, or turned on its side), in CSS px,
 * less 2% of the height so borders and rounding never push the last line onto a second page.
 */
const printableArea = (landscape: boolean) => {
  const [w, h] = landscape ? [PRINTABLE.height, PRINTABLE.width] : [PRINTABLE.width, PRINTABLE.height];

  return { w: mmToPx(w), h: mmToPx(h) * 0.98 };
};

/**
 * Scales a document marked data-print-fit="page" down to one page, as laid out at the page's width. Only by its height:
 * the paper is already the page's width, and anything wider shrinks inside it (FitWidth), on screen as in print.
 */
function fitToPage(node: HTMLElement, page: { w: number; h: number }) {
  const width = node.style.width;

  node.style.width = `${page.w}px`;
  const height = node.scrollHeight;
  node.style.width = width;
  const zoom = Math.min(1, page.h / height);

  if (zoom < 1) node.style.zoom = String(zoom);
}

/**
 * Prints only this element (the print stylesheet hides everything else), the way its layout prints: fitted to the page
 * first, under the layout's own @page rule, and put back once the print is done. One marked data-print-fit="page" is
 * scaled to fit a single page, and one marked data-print-orientation="landscape" prints on an A4 turned on its side.
 */
export function printElement(node: HTMLElement) {
  const layout = layoutOf(node);
  const fit = node.dataset.printFit;
  const landscape = isLandscape(node);
  // A later @page rule wins over the print stylesheet's (upright A4 inside its margins), for this print only.
  const page = document.createElement('style');

  node.setAttribute(MARKS.printRoot, '');

  if (fit === 'page') fitToPage(node, printableArea(landscape));

  if (landscape) {
    page.textContent = '@page { size: A4 landscape; }';
    document.head.append(page);
  }

  layout.fit?.(node);

  if (layout.page) {
    page.textContent = layout.page;
    document.head.append(page);
  }

  const done = () => {
    node.removeAttribute(MARKS.printRoot);
    node.style.zoom = '';
    layout.unfit?.(node);
    page.remove();
    window.removeEventListener('afterprint', done);
  };

  window.addEventListener('afterprint', done);
  window.print();
}
