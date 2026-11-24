import { layoutOf, MARKS } from './paper';
import { paperPdf } from './paper-pdf';
import type { Files } from './context';

const PDF_FILES = [{ name: 'PDF', extensions: ['pdf'] }];

/**
 * Saves a document element as an A4 PDF, asking where, with its text as text (docs/adr/0043). Where the platform can
 * print a page to a PDF (the Windows app), the PDF is the print itself. Elsewhere Keystone draws the paper into one
 * (paper-pdf.ts): its text in its fonts, its lines and boxes as shapes, its pictures as pictures. Either way it is the
 * paper's layout that says how it sits on the page.
 */
export async function savePdf(node: HTMLElement, name: string, files: Pick<Files, 'save' | 'printPdf'>): Promise<string | null> {
  const { printPdf } = files;
  const bytes = printPdf ? await asPrinted(node, printPdf) : await paperPdf(node);

  return files.save(name, bytes, PDF_FILES);
}

/**
 * Sets the page up to print only this element (the print stylesheet hides everything else), the way its layout prints
 * (paper.ts): fitted to the page, under the layout's own @page rule if it has one. Returns what puts it all back.
 */
function preparePrint(node: HTMLElement) {
  const layout = layoutOf(node);
  // A later @page rule wins over the print stylesheet's (upright A4 inside its margins), for this print only.
  const page = document.createElement('style');

  node.setAttribute(MARKS.printRoot, '');
  layout.fit?.(node);

  if (layout.page) {
    page.textContent = layout.page;
    document.head.append(page);
  }

  return () => {
    node.removeAttribute(MARKS.printRoot);
    layout.unfit?.(node);
    page.remove();
  };
}

/** The element printed to a PDF by the platform, set up as Print sets it up, and put back however the print went. */
async function asPrinted(node: HTMLElement, print: () => Promise<Uint8Array>) {
  const putBack = preparePrint(node);

  try {
    return await print();
  } finally {
    putBack();
  }
}

/** Prints only this element, the way its layout prints, and puts the page back once the print is done. */
export function printElement(node: HTMLElement) {
  const putBack = preparePrint(node);

  const done = () => {
    putBack();
    window.removeEventListener('afterprint', done);
  };

  window.addEventListener('afterprint', done);
  window.print();
}
