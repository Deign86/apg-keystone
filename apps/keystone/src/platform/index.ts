import { browserPlatform } from './browser';
import { startServiceWorker, webInstaller, webUpdater } from './pwa';
import type { Platform } from '@keystone/kit';

/**
 * The web app (docs/adr/0047): the browser platform, installable on a phone's or tablet's home screen, and in a built
 * app (not the dev server) with its service worker keeping the app shell and offering newer builds as updates.
 */
async function webPlatform(): Promise<Platform> {
  const installer = webInstaller(window);
  const container = import.meta.env.PROD ? navigator.serviceWorker : undefined;
  const worker = await startServiceWorker(container);
  const build = String(import.meta.env.VITE_KEYSTONE_BUILD ?? '');

  return {
    ...browserPlatform,
    installer,
    ...(worker && container && { updater: webUpdater(container, build, () => location.reload()) }),
  };
}

/** The desktop platform inside Tauri, the web app anywhere else. */
export async function detectPlatform(): Promise<Platform> {
  if (!('__TAURI_INTERNALS__' in window)) return webPlatform();
  const { desktopPlatform } = await import('./desktop');
  // The webview's user agent names the OS: WKWebView on macOS, WebView2 on Windows.
  const ua = navigator.userAgent;

  return desktopPlatform(/Windows/i.test(ua) ? 'windows' : /Mac OS X|Macintosh/i.test(ua) ? 'macos' : 'linux');
}
