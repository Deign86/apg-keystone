import type { Browser } from '@e2e-dev/web';

/**
 * The text on the papers on screen (a Sheet: a voucher, a statement, a payroll sheet, a payslip) set under 11px, the
 * house minimum (docs/DESIGN.md), as "text 10px". A paper prints and saves as a PDF as it shows, so this is the
 * smallest text on the page too. Empty when every line is at least 11px.
 */
export function tinyPaperText(browser: Browser) {
  return browser.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-ui="document"] *')].flatMap((e) => {
    const size = parseFloat(getComputedStyle(e).fontSize);
    const hasText = [...e.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());

    return hasText && size < 11 ? [`${e.textContent?.trim()} ${size}px`] : [];
  }));
}

/**
 * The text on the papers on screen that reads under 4.5:1 against what it sits on (WCAG AA for text this small: a
 * gold heading on a tinted band, a grey label on white), as "text 4.2:1". Empty when every line passes.
 */
export function faintPaperText(browser: Browser) {
  return browser.evaluate(() => {
    const rgb = (css: string) => (css.match(/[\d.]+/g) ?? []).map(Number);

    const luminance = (css: string) => {
      const [r, g, b] = rgb(css).slice(0, 3).map((c) => {
        const v = c / 255;

        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });

      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    // The nearest background behind an element that isn't see-through: a band's row, a box, or the paper.
    const ground = (e: HTMLElement | null): string => {
      for (let at = e; at; at = at.parentElement) {
        const bg = getComputedStyle(at).backgroundColor;

        if (rgb(bg)[3] !== 0) return bg;
      }

      return 'rgb(255, 255, 255)';
    };

    return [...document.querySelectorAll<HTMLElement>('[data-ui="document"] *')].flatMap((e) => {
      const hasText = [...e.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());

      if (!hasText) return [];

      const [fg, bg] = [luminance(getComputedStyle(e).color), luminance(ground(e))];
      const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);

      return ratio < 4.5 ? [`${e.textContent?.trim()} ${ratio.toFixed(2)}:1`] : [];
    });
  });
}

/**
 * The parts of the papers on screen marked for the field with focus (kit's Workspace), each as its text and the ring
 * drawn around it: "PAYEE MANILA ELECTRIC COMPANY · solid 2px". A two-up sheet gives each part twice, once a copy.
 * Empty when nothing is marked.
 */
export function markedPaperParts(browser: Browser) {
  return browser.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-ui="document"] [data-paper-active]')].map((e) => {
    const { outlineStyle, outlineWidth } = getComputedStyle(e);

    return `${e.innerText.replace(/\s+/g, ' ').trim()} · ${outlineStyle} ${outlineWidth}`;
  }));
}

/**
 * The media the page's stylesheets draw a marked part for: ["screen"] when the ring shows on screen and never in print.
 * Each rule that names the mark, by the @media it sits in ("all" for none).
 */
export function paperMarkMedia(browser: Browser) {
  return browser.evaluate(() => {
    const rules = (list: CSSRuleList, media: string): string[] => [...list].flatMap((r) => {
      if (r instanceof CSSMediaRule) return rules(r.cssRules, r.conditionText);

      if (r instanceof CSSStyleRule && r.selectorText.includes('data-paper-active')) return [media];

      return 'cssRules' in r && r.cssRules instanceof CSSRuleList ? rules(r.cssRules, media) : [];
    });

    return [...document.styleSheets].flatMap((sheet) => rules(sheet.cssRules, 'all'));
  });
}

/**
 * The marked parts of the papers on screen as Export PDF draws them (the paper carries `data-pdf-drawing` while it
 * does), each as its ring: "none" when the PDF leaves it out.
 */
export function markedPaperPartsDrawn(browser: Browser) {
  return browser.evaluate(() => {
    const papers = [...document.querySelectorAll<HTMLElement>('[data-ui="document"]')];

    papers.forEach((p) => p.setAttribute('data-pdf-drawing', ''));

    const rings = [...document.querySelectorAll<HTMLElement>('[data-ui="document"] [data-paper-active]')].map((e) => {
      return getComputedStyle(e).outlineStyle;
    });

    papers.forEach((p) => p.removeAttribute('data-pdf-drawing'));

    return rings;
  });
}

/**
 * Each paper on screen and each marked part of it as laid out ("703×1062", "28,140 400×24"), with the mark on and with
 * it taken off for a moment, so a test can show that marking a part moves nothing: the two are the same.
 */
export function paperLayoutWithAndWithoutMark(browser: Browser) {
  return browser.evaluate(() => {
    const marked = [...document.querySelectorAll<HTMLElement>('[data-ui="document"] [data-paper-active]')];

    const layout = () => [
      ...[...document.querySelectorAll<HTMLElement>('[data-ui="document"]')].map((e) => `${e.offsetWidth}×${e.offsetHeight}`),
      ...marked.map((e) => `${e.offsetLeft},${e.offsetTop} ${e.offsetWidth}×${e.offsetHeight}`),
    ];

    const on = layout();

    marked.forEach((e) => e.removeAttribute('data-paper-active'));

    const off = layout();

    marked.forEach((e) => e.setAttribute('data-paper-active', ''));

    return { marked: on, unmarked: off };
  });
}

/** Whether the first marked part lies wholly inside the preview beside the form (`label` names it), as scrolled. */
export function markedPartInView(browser: Browser, label: string) {
  return browser.evaluate((name: string) => {
    const part = document.querySelector('[data-ui="document"] [data-paper-active]')?.getBoundingClientRect();
    const box = document.querySelector(`section[aria-label="${name}"]`)?.getBoundingClientRect();

    return !!part && !!box && part.top >= box.top && part.bottom <= box.bottom;
  }, label);
}

/**
 * How many lines a filled-in value on a paper takes (the first box whose value is exactly `text`): 1 when it fits
 * beside its label, 0 when no box holds it. Measured once the paper's fonts have loaded, in laid-out sizes, so a
 * preview scaled down to fit its column counts the same.
 */
export function paperValueLines(browser: Browser, text: string) {
  return browser.evaluate(async (wanted: string) => {
    await document.fonts.ready;
    const value = [...document.querySelectorAll<HTMLElement>('[data-ui="document"] dd')].find((e) => e.textContent?.trim() === wanted);

    return value ? Math.round(value.offsetHeight / parseFloat(getComputedStyle(value).lineHeight)) : 0;
  }, text);
}

/**
 * Where the line before a voucher's right-hand column is painted in each part of the ruled form, in px from the paper's
 * left edge: beside the dates, the Amount heading, each amount, the blank box under them and the total. A line drawn on
 * a box's right falls inside that box; a collapsed table border is painted astride the cell's edge. One value when they
 * all meet in one straight line.
 */
export function voucherColumnLines(browser: Browser) {
  return browser.evaluate(() => {
    const copy = document.querySelector<HTMLElement>('[data-ui="document"] [data-sheet-copy]') ?? document.querySelector<HTMLElement>('[data-ui="document"]')!;
    const origin = copy.getBoundingClientRect().left;
    const scale = copy.getBoundingClientRect().width / copy.offsetWidth;
    const at = (x: number) => ((x - origin) / scale).toFixed(1);
    const parts = [...copy.querySelectorAll<HTMLElement>('dl:first-of-type > div, th, td, [aria-hidden="true"] > span')];

    return [...new Set(parts.flatMap((e) => {
      const style = getComputedStyle(e);
      const box = e.getBoundingClientRect();
      const [l, r] = [parseFloat(style.borderLeftWidth), parseFloat(style.borderRightWidth)];
      const collapsed = !!e.closest('table') && getComputedStyle(e.closest('table')!).borderCollapse === 'collapse';
      // Only the line into the right-hand column: the form's own frame is drawn by the box around it.
      const lines = [...(l > 0 ? [box.left - (collapsed ? (l * scale) / 2 : 0)] : []), ...(r > 0 && box.right < copy.getBoundingClientRect().right - 40 ? [box.right - r * scale] : [])];

      return lines.map(at);
    }))];
  });
}

/**
 * The most a page of a saved PDF may weigh. In the browser a paper is drawn at print resolution and kept compressed, a
 * few hundred kilobytes a page; stored as raw pixels it ran to tens of megabytes (packages/kit/src/output.ts).
 */
export const PDF_MOST_BYTES_A_PAGE = 700_000;

/** The pages of a saved PDF, each as its width and height in points. */
export function pdfPages(pdf: Buffer) {
  return [...pdf.toString('latin1').matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map(([, w, h]) => ({ w: Number(w), h: Number(h) }));
}

/**
 * A saved PDF as a PDF reader sees it (pdf.js): each page's size, its text as text, the box everything drawn on it
 * spans (its lines, boxes and bands; the page's clipping left out), and each image's size there, in points.
 */
export async function readPdf(pdf: Buffer) {
  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(pdf), verbosity: 0 }).promise;
  const pages = [];

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const [, , w, h] = page.view;
    const content = await page.getTextContent();
    const text = content.items.map((item) => ('str' in item ? item.str + (item.hasEOL ? ' ' : '') : '')).join('');
    const { fnArray, argsArray } = await page.getOperatorList();
    const images: { w: number; h: number }[] = [];
    const drawn = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    // The transform and the clip in force, kept per saved graphics state as a reader keeps them.
    let state = { ctm: [1, 0, 0, 1, 0, 0], clip: { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity } };
    const saved: (typeof state)[] = [];

    for (let i = 0; i < fnArray.length; i++) {
      const [fn, args] = [fnArray[i], argsArray[i]];
      const m = state.ctm;

      if (fn === OPS.save) saved.push(state);
      else if (fn === OPS.restore) state = saved.pop() ?? state;
      else if (fn === OPS.transform) {
        const [a, b, c, d, e, f] = args;

        state = { ...state, ctm: [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]] };
      } else if (fn === OPS.paintImageXObject) {
        images.push({ w: Math.abs(m[0]), h: Math.abs(m[3]) });
      } else if (fn === OPS.constructPath) {
        // A path by its corners, [x0, y0, x1, y1], where the page puts them, inside the clip in force.
        const [x0, y0, x1, y1] = args[2];
        const { clip } = state;

        const box = {
          x0: Math.max(clip.x0, Math.min(m[0] * x0, m[0] * x1) + m[4]),
          x1: Math.min(clip.x1, Math.max(m[0] * x0, m[0] * x1) + m[4]),
          y0: Math.max(clip.y0, Math.min(m[3] * y0, m[3] * y1) + m[5]),
          y1: Math.min(clip.y1, Math.max(m[3] * y0, m[3] * y1) + m[5]),
        };

        // A path that sets the clip draws nothing itself: what follows is drawn inside it.
        if (fnArray[i + 1] === OPS.clip || fnArray[i + 1] === OPS.eoClip) state = { ...state, clip: box };
        else if (box.x1 > box.x0 && box.y1 > box.y0) {
          drawn.x0 = Math.min(drawn.x0, box.x0);
          drawn.x1 = Math.max(drawn.x1, box.x1);
          drawn.y0 = Math.min(drawn.y0, box.y0);
          drawn.y1 = Math.max(drawn.y1, box.y1);
        }
      }
    }

    pages.push({ w, h, text, images, drawn });
  }

  return pages;
}

/**
 * The paper named `label` laid out as Print lays it out: the page's @media print rules applied while it is the print
 * root, as kit's preparePrint makes it, in this window. How far it sits from the middle of the window (on a page it is
 * as wide as the page, so 0 there means it starts at the page's edge), its width and its own laid-out width, and
 * anything else that still takes room, which would make the browser shrink the whole print to fit it.
 */
export function paperAsPrinted(browser: Browser, label: string) {
  return browser.evaluate((label) => {
    const paper = [...document.querySelectorAll<HTMLElement>('[data-ui="document"]')].find((p) => (p.getAttribute('aria-label') ?? '').startsWith(label));

    if (!paper) return null;

    const printRules = (list: CSSRuleList): string[] => [...list].flatMap((r) => {
      if (r instanceof CSSMediaRule) return r.conditionText.includes('print') ? [...r.cssRules].flatMap((c) => (c instanceof CSSPageRule ? [] : [c.cssText])) : printRules(r.cssRules);

      return 'cssRules' in r && r.cssRules instanceof CSSRuleList ? printRules(r.cssRules) : [];
    });

    const asPrint = document.createElement('style');

    asPrint.textContent = [...document.styleSheets].flatMap((sheet) => printRules(sheet.cssRules)).join(' ');
    paper.setAttribute('data-print-root', '');
    document.head.append(asPrint);

    // Anything but the paper, or what holds it, that still takes room in the print.
    const taking = (e: HTMLElement) => !paper.contains(e) && !e.contains(paper) && e.getBoundingClientRect().width > 0;
    const others = [...document.querySelectorAll<HTMLElement>('body *')].flatMap((e) => (taking(e) ? [`${e.tagName.toLowerCase()} ${Math.round(e.getBoundingClientRect().width)}px`] : []));
    const box = paper.getBoundingClientRect();
    const offCentre = Math.round(box.left - (document.documentElement.clientWidth - box.width) / 2);
    const printed = { offCentre, width: Math.round(box.width), laidOut: paper.offsetWidth, others: others.slice(0, 5) };

    asPrint.remove();
    paper.removeAttribute('data-print-root');

    return printed;
  }, label);
}
