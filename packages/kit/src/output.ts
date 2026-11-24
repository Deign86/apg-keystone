import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { layoutOf, MARKS, pdfPage, pdfPixelRatio } from './paper';
import type { Files } from './context';

/**
 * Renders a document element to an A4 PDF and asks where to save it, on a landscape page for a landscape sheet, with
 * what its layout asks of the PDF: a two-up sheet fills the whole page, as it prints, a copy on each half and the dashed
 * line between them. The paper is drawn at PDF_DPI for the size it takes on the page and kept lossless, compressed:
 * sharp in print and a few hundred kilobytes, where raw pixels ran to tens of megabytes.
 */
export async function savePdf(node: HTMLElement, name: string, files: Pick<Files, 'save'>): Promise<string | null> {
  const layout = layoutOf(node);
  const { orientation, margin, style } = layout.pdf;
  const pixelRatio = pdfPixelRatio(layout, { width: node.offsetWidth, height: node.offsetHeight });
  const png = await toPng(node, { pixelRatio, backgroundColor: getComputedStyle(node).backgroundColor || '#ffffff', cacheBust: true, style });
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation, compress: true });
  const { room } = pdfPage(layout);
  const img = pdf.getImageProperties(png);
  const scale = Math.min(room.w / img.width, room.h / img.height);

  // Without a compression jsPDF stores the PNG's pixels raw: 43 MB for a two-up voucher.
  pdf.addImage(png, 'PNG', margin, margin, img.width * scale, img.height * scale, undefined, 'SLOW');

  const bytes = new Uint8Array(pdf.output('arraybuffer'));

  return files.save(name, bytes, [{ name: 'PDF', extensions: ['pdf'] }]);
}

/**
 * Prints only this element (the print stylesheet hides everything else), the way its layout prints (paper.ts): fitted
 * to the page first, under the layout's own @page rule if it has one, and put back once the print is done.
 */
export function printElement(node: HTMLElement) {
  const layout = layoutOf(node);
  // A later @page rule wins over the print stylesheet's (upright A4 inside its margins), for this print only.
  const page = document.createElement('style');

  node.setAttribute(MARKS.printRoot, '');
  layout.fit?.(node);

  if (layout.page) {
    page.textContent = layout.page;
    document.head.append(page);
  }

  const done = () => {
    node.removeAttribute(MARKS.printRoot);
    layout.unfit?.(node);
    page.remove();
    window.removeEventListener('afterprint', done);
  };

  window.addEventListener('afterprint', done);
  window.print();
}
