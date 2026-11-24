import { toSvg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { layoutOf, MARKS, pageCuts, pdfAcross, pdfPage, pdfScale, PDF_DPI } from './paper';
import type { Files } from './context';

const PDF_FILES = [{ name: 'PDF', extensions: ['pdf'] }];

/**
 * Saves a document element as an A4 PDF, asking where. Where the platform can print a page to a PDF (the Windows
 * app), the PDF is the print itself (docs/adr/0043): real text with its fonts, lines as lines, on the pages Print makes.
 * Elsewhere the paper is drawn (`drawnPdf`). Either way it is the paper's layout that says how it sits on the page.
 */
export async function savePdf(node: HTMLElement, name: string, files: Pick<Files, 'save' | 'printPdf'>): Promise<string | null> {
  const { printPdf } = files;
  const bytes = printPdf ? await asPrinted(node, printPdf) : await drawnPdf(node);

  return files.save(name, bytes, PDF_FILES);
}

/**
 * Draws the paper into a PDF, for a platform that cannot print one: on a landscape page for a landscape sheet, the
 * two-up sheet across the whole page, and an upright paper at the page's width, on as many pages as it runs to, cut
 * between rows and lines (pageCuts). Each page is drawn at PDF_DPI and kept lossless, compressed: sharp in print and a
 * few hundred kilobytes, where raw pixels ran to tens of megabytes. One page-sized picture at a time, so a long paper
 * never needs a canvas larger than a phone's browser allows.
 */
async function drawnPdf(node: HTMLElement): Promise<Uint8Array> {
  const layout = layoutOf(node);
  const { orientation, margin, style } = layout.pdf;
  const paper = { width: node.offsetWidth, height: node.offsetHeight };
  const scale = pdfScale(layout, paper);
  const across = pdfAcross(layout, paper);
  const ratio = (PDF_DPI / 72) * scale;
  const background = getComputedStyle(node).backgroundColor || '#ffffff';
  const cuts = layout.pdf.flow ? pageCuts(paper.height, pdfPage(layout).room.h / scale, keepWhole(node)) : [0, paper.height];
  const picture = await pictureOf(node, style);
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation, compress: true });

  for (let i = 1; i < cuts.length; i++) {
    const [top, bottom] = [cuts[i - 1], cuts[i]];
    const canvas = document.createElement('canvas');
    const pen = canvas.getContext('2d');

    if (!pen) throw new Error('This browser cannot draw the paper into a PDF.');
    canvas.width = Math.round(paper.width * ratio);
    canvas.height = Math.round((bottom - top) * ratio);
    pen.fillStyle = background;
    pen.fillRect(0, 0, canvas.width, canvas.height);
    pen.drawImage(picture, 0, top, paper.width, bottom - top, 0, 0, canvas.width, canvas.height);

    if (i > 1) pdf.addPage('a4', orientation);
    // Without a compression jsPDF stores the PNG's pixels raw: 43 MB for a two-up voucher.
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', across.x, margin, across.width, (bottom - top) * scale, undefined, 'SLOW');
  }

  return new Uint8Array(pdf.output('arraybuffer'));
}

/**
 * The paper as a picture at its own size, which a canvas can draw any part of at any resolution (it is an SVG). Taken
 * with no part of it marked, whatever field has focus meanwhile (the stylesheet leaves a drawn paper's mark out).
 */
async function pictureOf(node: HTMLElement, style: Partial<CSSStyleDeclaration> | undefined) {
  const picture = new Image();

  node.setAttribute(MARKS.drawing, '');
  picture.src = await toSvg(node, { cacheBust: true, style }).finally(() => node.removeAttribute(MARKS.drawing));
  await picture.decode();

  return picture;
}

/**
 * The spans of the paper, in CSS px from its top as laid out, that a page break must not go through: each table row,
 * each line of text, each picture, and anything that asks not to be broken. Measured on screen, where the preview may
 * be scaled down, and scaled back to the paper's own size.
 */
function keepWhole(node: HTMLElement): [number, number][] {
  const box = node.getBoundingClientRect();
  const shrink = box.height / node.offsetHeight || 1;
  const spans: [number, number][] = [];
  const add = (r: DOMRect) => { if (r.height > 0) spans.push([(r.top - box.top) / shrink, (r.bottom - box.top) / shrink]); };

  for (const e of node.querySelectorAll('tr, img, svg, canvas')) add(e.getBoundingClientRect());

  for (const e of node.querySelectorAll<HTMLElement>('*')) {
    if (/avoid/.test(getComputedStyle(e).breakInside)) add(e.getBoundingClientRect());
  }

  const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const range = document.createRange();

  for (let t = text.nextNode(); t; t = text.nextNode()) {
    if (!t.textContent?.trim()) continue;

    range.selectNodeContents(t);

    for (const line of range.getClientRects()) add(line);
  }

  return spans;
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
