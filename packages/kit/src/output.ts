import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import type { Platform } from './platform';

/** Renders a document element to an A4 PDF (sharp at 3×) and asks where to save it. */
export async function savePdf(node: HTMLElement, name: string, platform: Platform): Promise<string | null> {
  const png = await toPng(node, { pixelRatio: 3, backgroundColor: getComputedStyle(node).backgroundColor || '#ffffff', cacheBust: true });
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const page = { w: pdf.internal.pageSize.getWidth(), h: pdf.internal.pageSize.getHeight() };
  const margin = 28;
  const img = pdf.getImageProperties(png);
  const scale = Math.min((page.w - margin * 2) / img.width, (page.h - margin * 2) / img.height);
  pdf.addImage(png, 'PNG', margin, margin, img.width * scale, img.height * scale);
  const bytes = new Uint8Array(pdf.output('arraybuffer'));

  return platform.saveFile(name, bytes, [{ name: 'PDF', extensions: ['pdf'] }]);
}

// The printable area of an A4 page with the print stylesheet's 12 mm margins, in CSS px,
// less 2% so borders and rounding never push the last line onto a second page.
const A4_PRINTABLE = { w: (186 / 25.4) * 96, h: (273 / 25.4) * 96 * 0.98 };

/** Scales a document marked data-print-fit down to one page, as laid out at the page's width. */
function fitToPage(node: HTMLElement) {
  const width = node.style.width;
  node.style.width = `${A4_PRINTABLE.w}px`;
  const height = node.scrollHeight;
  node.style.width = width;

  if (height > A4_PRINTABLE.h) node.style.zoom = String(A4_PRINTABLE.h / height);
}

/**
 * Prints only this element (the print stylesheet hides everything else). One marked
 * data-print-fit, such as the voucher's three copies, is scaled to fit a single page.
 */
export function printElement(node: HTMLElement) {
  node.setAttribute('data-print-root', '');

  if (node.hasAttribute('data-print-fit')) fitToPage(node);

  const done = () => {
    node.removeAttribute('data-print-root');
    node.style.zoom = '';
    window.removeEventListener('afterprint', done);
  };

  window.addEventListener('afterprint', done);
  window.print();
}
