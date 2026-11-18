import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { layoutOf, MARKS } from './paper';
import type { Files } from './context';

/**
 * Renders a document element to an A4 PDF (sharp at 4×, about 380 dpi on A4) and asks where to save it, on a landscape
 * page for a landscape sheet, with what its layout asks of the PDF: a two-up sheet fills the whole page, as it prints,
 * a copy on each half and the dashed line between them.
 */
export async function savePdf(node: HTMLElement, name: string, files: Pick<Files, 'save'>): Promise<string | null> {
  const { orientation, margin, style } = layoutOf(node).pdf;
  const png = await toPng(node, { pixelRatio: 4, backgroundColor: getComputedStyle(node).backgroundColor || '#ffffff', cacheBust: true, style });
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation });
  const page = { w: pdf.internal.pageSize.getWidth(), h: pdf.internal.pageSize.getHeight() };
  const room = { w: page.w - margin * 2, h: page.h - margin * 2 };
  const img = pdf.getImageProperties(png);
  const scale = Math.min(room.w / img.width, room.h / img.height);

  pdf.addImage(png, 'PNG', margin, margin, img.width * scale, img.height * scale);

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
