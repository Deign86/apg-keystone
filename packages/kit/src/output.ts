import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { HALF_PAGE_HEIGHT } from './documents';
import type { Platform } from './platform';

/** The print stylesheet's page margin, 12 mm, in PDF points. */
const MARGIN_PT = (12 / 25.4) * 72;

/**
 * Renders a document element to an A4 PDF (sharp at 3×) and asks where to save it. A two-up sheet
 * (data-print-fit="halves") fills the whole page, as it prints: a copy on each half, the dashed line between them.
 */
export async function savePdf(node: HTMLElement, name: string, platform: Platform): Promise<string | null> {
  const halves = node.dataset.printFit === 'halves';
  const margin = halves ? 0 : MARGIN_PT;
  // A two-up sheet's frame marks the paper's edge on screen only.
  const png = await toPng(node, { pixelRatio: 3, backgroundColor: getComputedStyle(node).backgroundColor || '#ffffff', cacheBust: true, style: halves ? { border: '0' } : undefined });
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const page = { w: pdf.internal.pageSize.getWidth(), h: pdf.internal.pageSize.getHeight() };
  const room = { w: page.w - margin * 2, h: page.h - margin * 2 };
  const img = pdf.getImageProperties(png);
  const scale = Math.min(room.w / img.width, room.h / img.height);

  pdf.addImage(png, 'PNG', margin, margin, img.width * scale, img.height * scale);

  const bytes = new Uint8Array(pdf.output('arraybuffer'));

  return platform.saveFile(name, bytes, [{ name: 'PDF', extensions: ['pdf'] }]);
}

// The printable area of an A4 page with the print stylesheet's 12 mm margins, in CSS px,
// less 2% so borders and rounding never push the last line onto a second page.
const A4_PRINTABLE = { w: (186 / 25.4) * 96, h: (273 / 25.4) * 96 * 0.98 };

/** Scales a document marked data-print-fit="page" down to one page, as laid out at the page's width. */
function fitToPage(node: HTMLElement) {
  const width = node.style.width;

  node.style.width = `${A4_PRINTABLE.w}px`;
  const height = node.scrollHeight;
  node.style.width = width;
  const zoom = Math.min(1, A4_PRINTABLE.h / height);

  if (zoom < 1) node.style.zoom = String(zoom);
}

/** The copies on a two-up sheet. */
const copiesOf = (node: HTMLElement) => [...node.querySelectorAll<HTMLElement>('[data-sheet-copy]')];

/**
 * Fits each copy on a two-up sheet to exactly half the page, shrinking one that runs longer, so the dashed line between
 * them falls at the middle, where the page is cut.
 */
function fitToHalves(node: HTMLElement) {
  for (const copy of copiesOf(node)) {
    const zoom = Math.min(1, HALF_PAGE_HEIGHT / copy.scrollHeight);

    if (zoom < 1) copy.style.zoom = String(zoom);
    copy.style.height = `${HALF_PAGE_HEIGHT / zoom}px`;
  }
}

/**
 * Prints only this element (the print stylesheet hides everything else). One marked
 * data-print-fit="page", such as the payroll sheet, is scaled to fit a single page. A two-up
 * sheet, such as a check voucher, prints with no page margin: its copies keep in from the edges themselves.
 */
export function printElement(node: HTMLElement) {
  const fit = node.dataset.printFit;
  const edgeToEdge = document.createElement('style');

  node.setAttribute('data-print-root', '');

  if (fit === 'page') fitToPage(node);

  if (fit === 'halves') {
    fitToHalves(node);
    // A later @page rule wins over the print stylesheet's 12 mm margin, for this print only.
    edgeToEdge.textContent = '@page { size: A4; margin: 0; }';
    document.head.append(edgeToEdge);
  }

  const done = () => {
    node.removeAttribute('data-print-root');
    node.style.zoom = '';

    for (const copy of copiesOf(node)) {
      copy.style.zoom = '';
      copy.style.height = '';
    }

    edgeToEdge.remove();
    window.removeEventListener('afterprint', done);
  };

  window.addEventListener('afterprint', done);
  window.print();
}
