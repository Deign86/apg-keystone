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

/** Prints only this element (the print stylesheet hides everything else). */
export function printElement(node: HTMLElement) {
  node.setAttribute('data-print-root', '');
  const done = () => { node.removeAttribute('data-print-root'); window.removeEventListener('afterprint', done); };

  window.addEventListener('afterprint', done);
  window.print();
}
