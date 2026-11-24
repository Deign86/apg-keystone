// What Keystone's service worker (service-worker.ts) does with each request the web app makes (docs/adr/0047). Kept
// apart from the worker and free of its globals, so the decision is tested on its own (src/test/pwa.test.ts).
//
// The worker keeps only the app shell: the page, its scripts, styles, fonts and icons, which a build names by their
// content. Never the records: Firestore, Firebase Auth and every other site are left to the network, untouched, and so
// is anything that is not a plain GET.

/** How the worker answers one request. */
export type Route =
  /** A file of this build's shell: from the worker's cache, else the network. */
  | 'shell'
  /** Opening Keystone (the page itself): the page this build kept, else the network. */
  | 'page'
  /** Not the worker's business: the browser fetches it as if there were no worker. */
  | 'network';

export interface RequestLike {
  url: string;
  method: string;
  /** `navigate` for opening a page. */
  mode: string;
}

/** The page every address of the app opens (an SPA: the screen is in the #). */
export const PAGE = '/index.html';

/**
 * How to answer `request`, made from the page at `origin`, given the shell files this build keeps (`shell`, paths like
 * "/assets/index-3f9a.js").
 */
export function routeFor(request: RequestLike, origin: string, shell: ReadonlySet<string>): Route {
  if (request.method !== 'GET') return 'network';
  let url: URL;

  try {
    url = new URL(request.url);
  } catch {
    return 'network';
  }

  // Firestore, Firebase Auth, Google's fonts and GitHub: always fresh, never kept.
  if (url.origin !== origin) return 'network';
  // Firebase's own sign-in pages, where a project serves them from the app's domain.

  if (url.pathname.startsWith('/__/')) return 'network';

  if (request.mode === 'navigate') return 'page';

  return shell.has(url.pathname) ? 'shell' : 'network';
}

/** The cache a build keeps its shell in. A new build keeps its own, and drops the others once it takes over. */
export const cacheName = (build: string) => `keystone-shell-${build}`;

/** The caches to drop when build `build` takes over: every older shell, and nothing that is not a Keystone shell. */
export const staleCaches = (names: readonly string[], build: string) =>
  names.filter((n) => n.startsWith('keystone-shell-') && n !== cacheName(build));
