import { readFileSync } from 'node:fs';
import type { Browser, WebApp } from '@e2e-dev/web';

// The tests' sample records (packages/core/sample/sample.json, made from shared/data/sample.json) put in the browser
// before Keystone's own code runs (web({ initScripts })), where a browser that had saved them would hold them.
// Keystone itself starts with none (docs/adr/0018).
//
// Only when nothing is saved yet, so a test that saves and reloads finds what it saved, and one that puts other text
// there (a damaged file) keeps it. A test that wants the empty start uses `startEmpty`, which marks the tab
// (`keystone-e2e-empty` in sessionStorage): `clear` empties the saved records as the next page loads, then `yes` keeps
// the sample records out.
const sample = readFileSync(new URL('../../packages/core/sample/sample.json', import.meta.url), 'utf8');

export const sampleRecords = `(() => {
  try {
    const empty = sessionStorage.getItem('keystone-e2e-empty');

    if (empty === 'clear') {
      localStorage.removeItem('keystone-state');
      sessionStorage.setItem('keystone-e2e-empty', 'yes');
    } else if (empty === null && localStorage.getItem('keystone-state') === null) {
      localStorage.setItem('keystone-state', ${JSON.stringify(sample)});
    }
  } catch { /* storage refused: the test sees an empty Keystone */ }
})();`;

/**
 * Reopens Keystone as a new computer or browser would: nothing saved, so no records at all. `path` is where, like
 * '/#banks'; a query goes before it, since changing only the # would not load the page again. The saved records are
 * emptied as the next page loads, not before leaving this one: leaving writes a change still waiting its 250 ms, which
 * would put them back.
 */
export async function startEmpty(app: WebApp, browser: Browser, path = '/') {
  await browser.evaluate(() => sessionStorage.setItem('keystone-e2e-empty', 'clear'));
  await app.open(`/?empty${path.replace(/^\//, '')}`);
}
