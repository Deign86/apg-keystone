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
