import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { TOUCH_QUERY, watchTouch, type PointerHost } from '../src/touch';

/** A stand-in for matchMedia whose answer the test changes, as attaching a tablet's keyboard and trackpad would. */
function pointer(coarse: boolean) {
  const listeners = new Set<() => void>();
  const asked: string[] = [];

  const list = {
    matches: coarse,
    addEventListener: (_: string, f: () => void) => { listeners.add(f); },
    removeEventListener: (_: string, f: () => void) => { listeners.delete(f); },
  };

  const host: PointerHost = {
    matchMedia: (q: string) => {
      asked.push(q);

      return list;
    },
  };

  return {
    asked,
    listeners,
    host,
    set(next: boolean) {
      list.matches = next;

      for (const f of listeners) f();
    },
  };
}

describe('watchTouch', () => {
  it('marks the page where the main pointer is a finger, and follows it when that changes', () => {
    const root = document.createElement('html');
    const p = pointer(true);
    const stop = watchTouch(root, p.host);

    expect(p.asked).toEqual([TOUCH_QUERY]);
    expect(root.hasAttribute('data-touch')).toBe(true);

    p.set(false);
    expect(root.hasAttribute('data-touch')).toBe(false);

    p.set(true);
    expect(root.hasAttribute('data-touch')).toBe(true);

    stop();
    expect(p.listeners.size).toBe(0);
  });

  it('leaves a page worked by a mouse unmarked', () => {
    const root = document.createElement('html');

    watchTouch(root, pointer(false).host);
    expect(root.hasAttribute('data-touch')).toBe(false);
  });

  it('does nothing where the browser cannot say', () => {
    const root = document.createElement('html');

    expect(() => watchTouch(root, {})()).not.toThrow();
    expect(root.hasAttribute('data-touch')).toBe(false);
  });
});

describe('touch sizes (styles.css)', () => {
  const css = readFileSync(createRequire(import.meta.url).resolve('@keystone/ui/styles.css'), 'utf8');

  it('makes every control at least 44px each way and text fields 16px under the mark', () => {
    expect(css).toMatch(/\[data-touch\] :is\(button, \[role="button"\][^{]*\{\s*min-height: 44px;\s*min-width: 44px;/);
    expect(css).toMatch(/\[data-touch\] :is\(\.input-chrome[^{]*\{\s*min-height: 44px;\s*font-size: 16px;/);
  });

  it('gives a box to tick a 44px area that takes the tap', () => {
    expect(css).toMatch(/\[data-touch\] \[role="checkbox"\][^{]*::after\s*\{\s*content: "";\s*position: absolute;\s*inset: -15px;/);
  });
});
