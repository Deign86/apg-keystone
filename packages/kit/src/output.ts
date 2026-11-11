import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import type { Platform } from './platform';

/** The print stylesheet's page margin, 12 mm, in PDF points. */
const MARGIN_PT = (12 / 25.4) * 72;

/**
 * Renders a document element to an A4 PDF (sharp at 3×) and asks where to save it. A half sheet (data-print-fit="half")
 * goes on the top half of the page, above a dashed line across the middle to cut along, as it prints.
 */
export async function savePdf(node: HTMLElement, name: string, platform: Platform): Promise<string | null> {
  const half = node.dataset.printFit === 'half';
  const png = await toPng(node, { pixelRatio: 3, backgroundColor: getComputedStyle(node).backgroundColor || '#ffffff', cacheBust: true });
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const page = { w: pdf.internal.pageSize.getWidth(), h: pdf.internal.pageSize.getHeight() };
  const room = { w: page.w - MARGIN_PT * 2, h: (half ? page.h / 2 : page.h) - MARGIN_PT * (half ? 1 : 2) };
  const img = pdf.getImageProperties(png);
  const scale = Math.min(room.w / img.width, room.h / img.height);

  pdf.addImage(png, 'PNG', MARGIN_PT, MARGIN_PT, img.width * scale, img.height * scale);

  if (half) {
    pdf.setLineDashPattern([4, 3], 0);
    pdf.setDrawColor(150);
    pdf.line(0, page.h / 2, page.w, page.h / 2);
  }

  const bytes = new Uint8Array(pdf.output('arraybuffer'));

  return platform.saveFile(name, bytes, [{ name: 'PDF', extensions: ['pdf'] }]);
}

// The printable area of an A4 page with the print stylesheet's 12 mm margins, in CSS px,
// less 2% so borders and rounding never push the last line onto a second page. A half
// sheet ends at the middle of the page, 136.5 mm below the top margin.
const A4_PRINTABLE = { w: (186 / 25.4) * 96, h: (273 / 25.4) * 96 * 0.98, half: (136.5 / 25.4) * 96 };

/**
 * Scales a document marked data-print-fit down to one page, or to the top half of one, as laid out at the page's
 * width. A half sheet is then stretched to end exactly at the middle of the page, where its dashed edge is cut.
 */
function fitToPage(node: HTMLElement) {
  const half = node.dataset.printFit === 'half';
  const room = half ? A4_PRINTABLE.half : A4_PRINTABLE.h;
  const width = node.style.width;

  node.style.width = `${A4_PRINTABLE.w}px`;
  const height = node.scrollHeight;
  node.style.width = width;
  const zoom = Math.min(1, room / height);

  if (zoom < 1) node.style.zoom = String(zoom);

  if (half) node.style.height = `${room / zoom}px`;
}

/**
 * Prints only this element (the print stylesheet hides everything else). One marked
 * data-print-fit, such as the payroll sheet or a check voucher, is scaled to fit a single page or half of one.
 */
export function printElement(node: HTMLElement) {
  node.setAttribute('data-print-root', '');

  if (node.hasAttribute('data-print-fit')) fitToPage(node);

  const done = () => {
    node.removeAttribute('data-print-root');
    node.style.zoom = '';
    node.style.height = '';
    window.removeEventListener('afterprint', done);
  };

  window.addEventListener('afterprint', done);
  window.print();
}
