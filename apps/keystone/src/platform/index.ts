import { browserPlatform } from './browser';
import type { Platform } from '@keystone/kit';

export type { Platform } from '@keystone/kit';

/** The desktop platform inside Tauri, the browser preview anywhere else. */
export async function detectPlatform(): Promise<Platform> {
  if (!('__TAURI_INTERNALS__' in window)) return browserPlatform;
  const { desktopPlatform } = await import('./desktop');
  // The webview's user agent names the OS: WKWebView on macOS, WebView2 on Windows.
  const ua = navigator.userAgent;

  return desktopPlatform(/Windows/i.test(ua) ? 'windows' : /Mac OS X|Macintosh/i.test(ua) ? 'macos' : 'linux');
}
