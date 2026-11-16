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
