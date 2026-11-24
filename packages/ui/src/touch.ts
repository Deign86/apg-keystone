/** The query for a screen worked by a finger: the main pointer is coarse (a phone, a tablet). */
export const TOUCH_QUERY = '(pointer: coarse)';

/** What watchTouch reads of the browser: its answer to a media query, and word when that answer changes. */
export interface PointerHost {
  matchMedia?(query: string): {
    readonly matches: boolean;
    addEventListener(type: 'change', listener: () => void): void;
    removeEventListener(type: 'change', listener: () => void): void;
  };
}

/**
 * Marks the page `data-touch` while its main pointer is coarse, and follows it when that changes (a tablet's keyboard
 * and trackpad attached or taken off). The design system's touch sizes hang on the mark (styles.css): every control
 * 44px, text fields at 16px. Does nothing where the browser cannot say. Returns the way to stop.
 */
export function watchTouch(root: HTMLElement = document.documentElement, host: PointerHost = window): () => void {
  if (!host.matchMedia) return () => {};

  const coarse = host.matchMedia(TOUCH_QUERY);
  const mark = () => root.toggleAttribute('data-touch', coarse.matches);

  mark();
  coarse.addEventListener('change', mark);

  return () => coarse.removeEventListener('change', mark);
}
