import type { Browser } from '@e2e-dev/web';
import type { Screen } from 'e2e';

// What a phone or tablet needs of every screen (the mobile suite, e2e.mobile.config.ts).

/** Every screen the rail lists, by its address, in rail order. */
export const SCREENS = [
  'home', 'overview', 'vouchers', 'funds', 'billing', 'soa', 'id-maker', 'directory', 'activity', 'timekeeping', 'payroll',
  'profile', 'accounts', 'data', 'banks', 'company',
] as const;

/** Whether the page is narrower than 768px, where the rail is behind the Menu button. */
export const isPhone = (browser: Browser) => browser.evaluate(() => innerWidth < 768);

/** Opens a screen from the rail, or from the Menu where the rail is behind it (a phone), as a person does. */
export async function openFromRail(screen: Screen, browser: Browser, title: string) {
  if (await isPhone(browser)) await screen.getByRole('button', 'Menu').tap();
  await screen.getByRole('navigation', 'Keystone').getByRole('button', new RegExp(`${title}$`)).tap();
}

/**
 * What stops the screen on view being used by a finger, as sentences, at the page's size now: the page or the screen
 * scrolling sideways, and any control on it a finger cannot hit, one that does not take a tap across 44 × 44 px
 * around its middle (WCAG 2.5.5). A tap counts where it lands on the control, inside it, or on the label it is in;
 * a box to tick takes it on the area around it. Each tab of the screen is checked in turn. The paper previews are
 * left out: a paper is scaled to fit, and is not worked by a finger, but for a signature's handle, checked on its own.
 */
export function layoutProblems(browser: Browser) {
  return browser.evaluate(async () => {
    const problems: string[] = [];
    const main = document.getElementById('main');
    const name = (e: Element) => `${e.getAttribute('role') ?? e.tagName.toLowerCase()} "${(e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 40)}"`;
    const tabs = [...(main?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])];
    const views = [null, ...tabs];

    for (const tab of views) {
      if (tab) {
        tab.click();
        await new Promise((done) => { setTimeout(done, 150); });
      }

      const where = tab ? `${location.hash} › ${tab.textContent?.trim()}` : location.hash || '#home';
      const page = document.documentElement.scrollWidth - innerWidth;

      if (page > 0) problems.push(`${where}: the page scrolls sideways by ${page}px`);

      if (main && main.scrollWidth > main.clientWidth) problems.push(`${where}: the screen scrolls sideways by ${main.scrollWidth - main.clientWidth}px`);

      const controls = document.querySelectorAll<HTMLElement>([
        'button', 'a[href]', 'input', 'select', 'textarea', 'summary',
        '[role="button"]', '[role="tab"]', '[role="combobox"]', '[role="checkbox"]', '[role="menuitem"]', '[role="option"]',
      ].join(','));

      for (const el of controls) {
        if (el.closest('[data-sheet-frame], [aria-hidden="true"], [hidden]')) continue;
        const box = el.getBoundingClientRect();
        // Not shown (in a closed fold too), or a control drawn by another (a visually hidden input under a styled box).

        if (box.width <= 1 || box.height <= 1 || !el.checkVisibility({ visibilityProperty: true })) continue;

        if (el.matches(':disabled, [aria-disabled="true"]')) {
          // Taps pass through a disabled control, so its own size is what counts.
          if (box.width < 44 || box.height < 44) problems.push(`${where}: ${name(el)} is ${Math.round(box.width)}×${Math.round(box.height)}px`);
          continue;
        }

        el.scrollIntoView({ block: 'center', inline: 'center' });
        const at = el.getBoundingClientRect();
        const [x, y] = [at.left + at.width / 2, at.top + at.height / 2];
        const label = el.closest('label');

        const takes = (dx: number, dy: number) => {
          const hit = document.elementFromPoint(x + dx, y + dy);

          return !!hit && (el.contains(hit) || !!label?.contains(hit));
        };

        if (![[0, 0], [-21, 0], [21, 0], [0, -21], [0, 21]].every(([dx, dy]) => takes(dx, dy))) {
          problems.push(`${where}: ${name(el)} takes a tap on ${Math.round(at.width)}×${Math.round(at.height)}px`);
        }
      }

      main?.scrollTo({ top: 0 });
    }

    return problems;
  });
}
