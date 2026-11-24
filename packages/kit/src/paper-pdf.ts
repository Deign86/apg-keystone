import { jsPDF } from 'jspdf';
import { layoutOf, MARKS, pageCuts, pdfAcross, pdfPage, pdfPixelRatio, pdfScale, type PaperLayout } from './paper';

// A paper as a PDF of its own drawing, for a platform that cannot print a page to one (a Mac, a browser, a phone;
// docs/adr/0043). The paper is read as the browser laid it out, and each part drawn as what it is: its text as text, in
// the fonts the page uses, embedded and selectable, so a PDF editor can change it; backgrounds and borders as filled
// and stroked shapes; and only real pictures (the logo, signatures) as images. Nothing is drawn as a picture of the page.

type Rgb = [number, number, number];

type Box = { x: number; y: number; w: number; h: number };

/** A font file the page declares (@font-face): its family, the weights it covers, where it is. */
interface Face { family: string; min: number; max: number; url: string }

/** One line of a text node as laid out: each character where the browser put it, and how it is set. */
interface TextLine {
  kind: 'text';
  y: number;
  h: number;
  chars: { ch: string; x: number; w: number }[];
  stack: string[];
  weight: number;
  /** Size and the font's ascent, in the paper's px: the line's own scale (a table shrunk to fit) applied. */
  size: number;
  ascent: number;
  color: Rgb;
}

type Part =
  | ({ kind: 'fill'; color: Rgb; radius: number } & Box)
  | ({ kind: 'border'; radius: number; sides: Side[] } & Box)
  | ({ kind: 'image'; source: HTMLImageElement | SVGSVGElement; fit: string; position: string } & Box)
  | TextLine;

type Side = { at: 'top' | 'right' | 'bottom' | 'left'; width: number; color: Rgb; style: string };

/** Draws the paper into an A4 PDF the way it prints, as text, shapes and its real pictures. */
export async function paperPdf(node: HTMLElement): Promise<Uint8Array> {
  const layout = layoutOf(node);
  const { orientation, margin } = layout.pdf;
  const paper = { width: node.offsetWidth, height: node.offsetHeight };
  const scale = pdfScale(layout, paper);
  const across = pdfAcross(layout, paper);
  const cuts = layout.pdf.flow ? pageCuts(paper.height, pdfPage(layout).room.h / scale, keepWhole(node)) : [0, paper.height];

  // Read with no part of it marked, whatever field has focus meanwhile (the stylesheet leaves a drawn paper's mark out).
  node.setAttribute(MARKS.drawing, '');

  let parts: Part[];

  try {
    parts = partsOf(node, layout);
  } finally {
    node.removeAttribute(MARKS.drawing);
  }

  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation, compress: true });
  const fonts = new Fonts(pdf, facesOf(document));
  const images = await picturesOf(parts, pdfPixelRatio(layout, paper));
  const runs = await fonts.runsOf(parts.filter((p): p is TextLine => p.kind === 'text'));

  for (let i = 1; i < cuts.length; i++) {
    const [top, bottom] = [cuts[i - 1], cuts[i]];
    const pen = new Pen(pdf, { x: across.x, y: margin - top * scale, scale });

    if (i > 1) pdf.addPage('a4', orientation);

    // This page shows its slice of the paper alone: a box that runs on is cut at the page's edge, as Print cuts it.
    pdf.saveGraphicsState();
    pdf.rect(across.x, margin, across.width, (bottom - top) * scale, null);
    pdf.clip();
    pdf.discardPath();

    for (const part of parts) {
      if (part.kind === 'text') {
        if (part.y >= top - 0.5 && part.y < bottom) for (const run of runs.get(part) ?? []) pen.text(run, part);
      } else if (part.y < bottom && part.y + part.h > top) {
        pen.part(part, images.get(part));
      }
    }

    pdf.restoreGraphicsState();
  }

  return new Uint8Array(pdf.output('arraybuffer'));
}

/**
 * The spans of the paper, in CSS px from its top as laid out, that a page break must not go through: each table row,
 * each line of text, each picture, and anything that asks not to be broken. Measured on screen, where the preview may
 * be scaled down, and scaled back to the paper's own size.
 */
export function keepWhole(node: HTMLElement): [number, number][] {
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

// Reading the paper.

/** Any CSS colour as RGB on white paper, or null for none: the canvas reads every syntax the page may use. */
const ink = (() => {
  const pen = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const known = new Map<string, Rgb | null>();

  return (css: string): Rgb | null => {
    if (known.has(css)) return known.get(css) ?? null;

    if (!pen) return [0, 0, 0];

    pen.clearRect(0, 0, 1, 1);
    pen.fillStyle = '#000';
    pen.fillStyle = css;
    pen.fillRect(0, 0, 1, 1);

    const [r, g, b, a] = pen.getImageData(0, 0, 1, 1).data;
    // A see-through colour as it shows over the white paper.
    const over = (c: number) => Math.round(c * (a / 255) + 255 * (1 - a / 255));
    const rgb: Rgb | null = a === 0 ? null : [over(r), over(g), over(b)];

    known.set(css, rgb);

    return rgb;
  };
})();

const families = (stack: string) => stack.split(',').map((f) => f.trim().replace(/^["']|["']$/g, ''));

/** Every part of the paper to draw, in the order the browser paints them, in the paper's own px. */
function partsOf(node: HTMLElement, layout: PaperLayout): Part[] {
  const box = node.getBoundingClientRect();
  const k = box.width / node.offsetWidth || 1;
  const at = (r: DOMRect): Box => ({ x: (r.left - box.left) / k, y: (r.top - box.top) / k, w: r.width / k, h: r.height / k });
  const parts: Part[] = [];
  const measure = document.createElement('canvas').getContext('2d');
  const range = document.createRange();
  // A layout may take the paper's own frame away in its PDF (the two-up sheet's, which marks its edge on screen only).
  const { frameless } = layout.pdf;

  const lines = (text: Text, style: CSSStyleDeclaration) => {
    const color = ink(style.color);
    const upper = style.textTransform === 'uppercase';
    const placed: { ch: string; r: Box }[] = [];

    for (let i = 0; i < text.data.length;) {
      const code = text.data.codePointAt(i) ?? 32;
      const size = code > 0xffff ? 2 : 1;

      range.setStart(text, i);
      range.setEnd(text, i + size);

      const r = range.getClientRects()[0];

      if (r && r.width > 0) {
        const ch = /\s/.test(String.fromCodePoint(code)) ? ' ' : String.fromCodePoint(code);

        placed.push({ ch: upper ? ch.toUpperCase() : ch, r: at(r) });
      }

      i += size;
    }

    if (!color || !placed.length || !measure) return;

    measure.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

    const metrics = measure.measureText('Hg');
    const content = metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;

    // A line at a time: the characters the browser set on one line share its top.
    for (let start = 0; start < placed.length;) {
      let end = start + 1;

      while (end < placed.length && Math.abs(placed[end].r.y - placed[start].r.y) < placed[start].r.h / 2) end++;

      const line = placed.slice(start, end);
      // The line's height the most of its characters have: the page's font's, not a fallback glyph's.
      const heights = line.map((c) => Math.round(c.r.h * 10) / 10);
      const h = [...heights].sort((a, b) => heights.filter((x) => x === b).length - heights.filter((x) => x === a).length)[0];
      const own = h / content || 1;

      parts.push({
        kind: 'text',
        y: line.find((c) => Math.round(c.r.h * 10) / 10 === h)?.r.y ?? line[0].r.y,
        h,
        chars: line.map((c) => ({ ch: c.ch, x: c.r.x, w: c.r.w })),
        stack: families(style.fontFamily),
        weight: Number(style.fontWeight) || 400,
        size: parseFloat(style.fontSize) * own,
        ascent: metrics.fontBoundingBoxAscent * own,
        color,
      });
      start = end;
    }
  };

  const walk = (el: Element, root: boolean) => {
    const style = getComputedStyle(el);

    // Not shown: not drawn. Text only for screen readers (sr-only) is clipped to nothing.
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;

    if (style.clipPath !== 'none' || (style.clip !== 'auto' && style.clip !== '')) return;

    const r = at(el.getBoundingClientRect());
    const own = el instanceof HTMLElement && el.offsetWidth ? r.w / el.offsetWidth : 1;
    const radius = parseFloat(style.borderTopLeftRadius) * own || 0;
    const fill = ink(style.backgroundColor);

    if (fill && r.w > 0 && r.h > 0) parts.push({ kind: 'fill', color: fill, radius, ...r });

    const sides = (['top', 'right', 'bottom', 'left'] as const).flatMap((side): Side[] => {
      const width = parseFloat(style.getPropertyValue(`border-${side}-width`)) * own;
      const color = ink(style.getPropertyValue(`border-${side}-color`));
      const line = style.getPropertyValue(`border-${side}-style`);

      return width > 0 && color && line !== 'none' && line !== 'hidden' ? [{ at: side, width, color, style: line }] : [];
    });

    if (sides.length && !(root && frameless)) parts.push({ kind: 'border', radius, sides, ...r });

    if (el instanceof HTMLImageElement || el instanceof SVGSVGElement) {
      if (r.w > 0 && r.h > 0) parts.push({ kind: 'image', source: el, fit: style.objectFit, position: style.objectPosition, ...r });

      return;
    }

    for (const child of el.childNodes) {
      if (child instanceof Element) walk(child, false);
      else if (child instanceof Text && child.data.trim()) lines(child, style);
    }
  };

  walk(node, true);

  // Painted as the browser paints a paper: every background first, then every border, the heaviest last, as a table's
  // collapsed borders let the heavier win where two meet; then the pictures, then the text on top.
  const layer = (p: Part) => ({ fill: 0, border: 1, image: 2, text: 3 })[p.kind];
  const weight = (p: Part) => (p.kind === 'border' ? Math.max(...p.sides.map((s) => s.width)) : 0);

  return parts.map((p, i) => ({ p, i })).sort((a, b) => layer(a.p) - layer(b.p) || weight(a.p) - weight(b.p) || a.i - b.i).map(({ p }) => p);
}

// Pictures.

/** Each picture on the paper as a PNG at the PDF's resolution for the size it is drawn, fitted as the page fits it. */
async function picturesOf(parts: Part[], ratio: number) {
  const out = new Map<Part, string>();

  for (const part of parts) {
    if (part.kind !== 'image') continue;

    const picture = part.source instanceof HTMLImageElement ? part.source : await svgPicture(part.source);

    if (!picture.complete) await picture.decode().catch(() => {});

    if (!picture.naturalWidth) continue;

    const canvas = document.createElement('canvas');
    const pen = canvas.getContext('2d');

    if (!pen) continue;

    canvas.width = Math.max(1, Math.round(part.w * ratio));
    canvas.height = Math.max(1, Math.round(part.h * ratio));

    const [nw, nh] = [picture.naturalWidth, picture.naturalHeight];
    const fit = part.fit === 'contain' ? Math.min(canvas.width / nw, canvas.height / nh) : part.fit === 'cover' ? Math.max(canvas.width / nw, canvas.height / nh) : 0;

    // Where a fitted picture sits in its box (object-position): a signature on its line, at the box's foot.
    const [across = '50%', down = '50%'] = part.position.split(/\s+/);
    const share = (at: string, room: number) => (at.endsWith('%') ? (room * parseFloat(at)) / 100 : parseFloat(at) * ratio || 0);

    if (fit) pen.drawImage(picture, share(across, canvas.width - nw * fit), share(down, canvas.height - nh * fit), nw * fit, nh * fit);
    else pen.drawImage(picture, 0, 0, canvas.width, canvas.height);

    out.set(part, canvas.toDataURL('image/png'));
  }

  return out;
}

async function svgPicture(svg: SVGSVGElement) {
  const picture = new Image();

  picture.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
  await picture.decode().catch(() => {});

  return picture;
}

// Fonts.

/** The font files the page declares, from its stylesheets' @font-face rules. */
function facesOf(doc: Document): Face[] {
  const faces: Face[] = [];

  const read = (rules: CSSRuleList, base: string) => {
    for (const rule of rules) {
      if (rule instanceof CSSFontFaceRule) {
        const url = /url\((["']?)([^"')]+)\1\)/.exec(rule.style.getPropertyValue('src'))?.[2];
        const [min, max = min] = rule.style.getPropertyValue('font-weight').split(/\s+/).map((w) => (w === 'bold' ? 700 : Number(w) || 400));

        if (url) faces.push({ family: families(rule.style.getPropertyValue('font-family'))[0], min, max, url: new URL(url, base).href });
      } else if ('cssRules' in rule && rule.cssRules instanceof CSSRuleList) {
        read(rule.cssRules, base);
      }
    }
  };

  for (const sheet of doc.styleSheets) {
    try {
      read(sheet.cssRules, sheet.href ?? doc.baseURI);
    } catch {
      // A stylesheet from another site cannot be read; it declares none of Keystone's fonts.
    }
  }

  return faces;
}

const fontFiles = new Map<string, Promise<string>>();

/** A font file as base64, fetched once a session. */
function fontFile(url: string) {
  let file = fontFiles.get(url);

  if (!file) {
    file = fetch(url).then(async (answer) => {
      if (!answer.ok) throw new Error(`Keystone could not load the font ${url} for the PDF.`);

      const bytes = new Uint8Array(await answer.arrayBuffer());
      let text = '';

      for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));

      return btoa(text);
    });
    file.catch(() => fontFiles.delete(url));
    fontFiles.set(url, file);
  }

  return file;
}

/** What jsPDF reads from an embedded TrueType file: which glyph draws a character (0 for none). */
interface TrueTypeFile { characterToGlyph(code: number): number }

/** One piece of a line set in one font: its characters, where it starts and how wide the browser set it. */
interface Run { font: string; text: string; x: number; w: number; stroke: number }

/** The page's fonts embedded in one PDF, each the first time a character needs it. */
class Fonts {
  private loaded = new Map<Face, Promise<string>>();

  constructor(private pdf: jsPDF, private faces: Face[]) {}

  /** The face of `family` nearest `weight`: one that covers it, or the closest weight. */
  private face(family: string, weight: number) {
    const own = this.faces.filter((f) => f.family === family);
    const gap = (f: Face) => (weight < f.min ? f.min - weight : weight > f.max ? weight - f.max : 0);

    return [...own].sort((a, b) => gap(a) - gap(b))[0];
  }

  /** Embeds a face in the PDF, once, and gives its name there. */
  private load(face: Face) {
    let name = this.loaded.get(face);

    if (!name) {
      const id = `${face.family}-${face.min}`;

      name = fontFile(face.url).then((file) => {
        this.pdf.addFileToVFS(`${id}.ttf`, file);
        this.pdf.addFont(`${id}.ttf`, id, 'normal');

        return id;
      });
      this.loaded.set(face, name);
    }

    return name;
  }

  /** Whether the embedded font draws this character, rather than its empty box. */
  private draws(font: string, ch: string) {
    this.pdf.setFont(font, 'normal');

    // jsPDF keeps an embedded TrueType font's parsed file on `metadata` (typed `any`); a standard font has none.
    const file: TrueTypeFile | undefined = this.pdf.getFont().metadata;

    return !file || file.characterToGlyph(ch.codePointAt(0) ?? 32) !== 0;
  }

  /** The font for a character: the first of its stack the page declares that draws it, as the browser picks. */
  private async fontFor(stack: string[], weight: number, ch: string) {
    let first: Face | undefined;

    for (const family of stack) {
      const face = this.face(family, weight);

      if (!face) continue;

      first ??= face;

      if (ch === ' ' || this.draws(await this.load(face), ch)) return face;
    }

    return first;
  }

  /** Each line cut into runs of one font, as the browser set it. */
  async runsOf(lines: TextLine[]) {
    const out = new Map<TextLine, Run[]>();

    for (const line of lines) {
      const runs: Run[] = [];

      for (const c of line.chars) {
        const face = await this.fontFor(line.stack, line.weight, c.ch);

        if (!face) continue;

        const font = await this.load(face);
        const last = runs.at(-1);

        if (last && last.font === font) {
          last.text += c.ch;
          last.w = c.x + c.w - last.x;
        } else {
          // A variable font embeds at its lightest weight: a heavier one is drawn with an outline as thick as the gap.
          runs.push({ font, text: c.ch, x: c.x, w: c.w, stroke: face.max > face.min ? Math.max(0, line.weight - face.min) / 100 : 0 });
        }
      }

      out.set(line, runs);
    }

    return out;
  }
}

// Drawing.

/** Draws the paper's parts on one page: its px placed and scaled to points there. */
class Pen {
  constructor(private pdf: jsPDF, private place: { x: number; y: number; scale: number }) {}

  private x = (px: number) => this.place.x + px * this.place.scale;
  private y = (px: number) => this.place.y + px * this.place.scale;
  private len = (px: number) => px * this.place.scale;

  part(part: Exclude<Part, TextLine>, picture?: string) {
    const { pdf } = this;
    const [x, y, w, h] = [this.x(part.x), this.y(part.y), this.len(part.w), this.len(part.h)];

    if (part.kind === 'fill') {
      pdf.setFillColor(...part.color);

      if (part.radius) pdf.roundedRect(x, y, w, h, this.len(part.radius), this.len(part.radius), 'F');
      else pdf.rect(x, y, w, h, 'F');
    } else if (part.kind === 'image') {
      if (picture) pdf.addImage(picture, 'PNG', x, y, w, h, undefined, 'SLOW');
    } else {
      this.border(part, { x, y, w, h });
    }
  }

  private border(part: Extract<Part, { kind: 'border' }>, b: Box) {
    const { pdf } = this;
    const [first] = part.sides;
    const even = part.sides.length === 4 && part.sides.every((s) => s.width === first.width && s.style === first.style && s.color.join() === first.color.join());

    if (part.radius && even) {
      const width = this.len(first.width);

      pdf.setDrawColor(...first.color);
      pdf.setLineWidth(width);
      pdf.roundedRect(b.x + width / 2, b.y + width / 2, b.w - width, b.h - width, this.len(part.radius), this.len(part.radius), 'S');

      return;
    }

    for (const side of part.sides) {
      const width = this.len(side.width);
      const solid = side.style !== 'dashed' && side.style !== 'dotted';

      // Each side's band, inside the box, as CSS draws it.
      const band: Box = {
        top: { x: b.x, y: b.y, w: b.w, h: width },
        bottom: { x: b.x, y: b.y + b.h - width, w: b.w, h: width },
        left: { x: b.x, y: b.y, w: width, h: b.h },
        right: { x: b.x + b.w - width, y: b.y, w: width, h: b.h },
      }[side.at];

      if (solid) {
        pdf.setFillColor(...side.color);
        pdf.rect(band.x, band.y, band.w, band.h, 'F');
      } else {
        const across = side.at === 'top' || side.at === 'bottom';
        const dash = side.style === 'dotted' ? [width, width] : [width * 3, width * 3];

        pdf.setDrawColor(...side.color);
        pdf.setLineWidth(width);
        pdf.setLineDashPattern(dash, 0);

        if (across) pdf.line(band.x, band.y + width / 2, band.x + band.w, band.y + width / 2);
        else pdf.line(band.x + width / 2, band.y, band.x + width / 2, band.y + band.h);
        pdf.setLineDashPattern([], 0);
      }
    }
  }

  /** A run of text where the browser set it: on the line's baseline, spaced so it is exactly as wide. */
  text(run: Run, line: TextLine) {
    const { pdf } = this;
    const size = this.len(line.size);

    pdf.setFont(run.font, 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(...line.color);

    const natural = pdf.getStringUnitWidth(run.text) * size;
    const charSpace = (this.len(run.w) - natural) / [...run.text].length;
    const stroke = run.stroke * size * 0.012;

    if (stroke) {
      pdf.setDrawColor(...line.color);
      pdf.setLineWidth(stroke);
    }

    pdf.text(run.text, this.x(run.x), this.y(line.y + line.ascent), { baseline: 'alphabetic', charSpace, renderingMode: stroke ? 'fillThenStroke' : 'fill' });
  }
}
