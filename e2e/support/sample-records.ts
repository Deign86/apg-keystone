import { readFileSync } from 'node:fs';
import type { Browser, WebApp } from '@e2e-dev/web';

// The tests' sample records (packages/core/sample/sample.json, made from shared/data/sample.json) put in the browser
// before Keystone's own code runs (web({ initScripts })), where a browser that had saved them would hold them.
// Keystone itself starts with none (docs/adr/0018).
//
// Only when nothing is saved yet, so a test that saves and reloads finds what it saved, and one that puts other text
// there (a damaged file) keeps it. A test that wants the empty start sets `keystone-e2e-empty` in sessionStorage first.
const sample = readFileSync(new URL('../../packages/core/sample/sample.json', import.meta.url), 'utf8');

export const sampleRecords = `(() => {
  try {
    if (sessionStorage.getItem('keystone-e2e-empty') === null && localStorage.getItem('keystone-state') === null) {
      localStorage.setItem('keystone-state', ${JSON.stringify(sample)});
    }
  } catch { /* storage refused: the test sees an empty Keystone */ }
})();`;

/**
 * Reopens Keystone as a new computer or browser would: nothing saved, so no records at all. `path` is where, like
 * '/#banks'; a query goes before it, since changing only the # would not load the page again.
 */
export async function startEmpty(app: WebApp, browser: Browser, path = '/') {
  await browser.evaluate(() => {
    sessionStorage.setItem('keystone-e2e-empty', 'yes');
    localStorage.removeItem('keystone-state');
  });
  await app.open(`/?empty${path.replace(/^\//, '')}`);
}
