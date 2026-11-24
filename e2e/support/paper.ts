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
