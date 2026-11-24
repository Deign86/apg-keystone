import type { Browser } from '@e2e-dev/web';

// A force close (taskkill /F, Force Quit, the desktop window destroyed) warns the page of nothing: no pagehide, no
// visibilitychange, no unload. A reload in the test browser would still send them, so before Keystone's own scripts run,
// listening for leaving is made to do nothing; a reload after that is, to Keystone, the process killed.

/** From the next page on, Keystone hears nothing of leaving, as when the process is killed. */
export async function deafToLeaving(browser: Browser) {
  await browser.addInitScript(() => {
    const listen = EventTarget.prototype.addEventListener;
    const leaving = new Set(['pagehide', 'beforeunload', 'unload', 'visibilitychange', 'freeze']);

    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (!leaving.has(type)) listen.call(this, type, listener, options);
    };
  });
}
