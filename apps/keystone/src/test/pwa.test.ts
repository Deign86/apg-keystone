import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { isAppleMobile, startServiceWorker, webInstaller, webUpdater, WORKER_URL, type InstallHost, type WorkerContainer, type WorkerHandle, type WorkerMessage, type WorkerRegistration } from '../platform/pwa';
import { cacheName, PAGE, routeFor, staleCaches } from '../platform/sw-routes';

// The web app (docs/adr/0046): what its service worker keeps and what it leaves to the network, its updates, its
// install, and how Vercel serves it.

const ORIGIN = 'https://keystone.example.app';
const SHELL = new Set(['/assets/index-3f9a.js', '/assets/index-77c1.css', '/icon-192.png', PAGE]);
const get = (url: string, mode = 'cors') => ({ url, method: 'GET', mode });

describe('what the service worker keeps', () => {
  it('answers the build\'s own files from what it keeps, and opening Keystone from the network first', () => {
    expect(routeFor(get(`${ORIGIN}/assets/index-3f9a.js`), ORIGIN, SHELL)).toBe('shell');
    expect(routeFor(get(`${ORIGIN}/icon-192.png`), ORIGIN, SHELL)).toBe('shell');
    expect(routeFor(get(`${ORIGIN}/`, 'navigate'), ORIGIN, SHELL)).toBe('page');
    expect(routeFor(get(`${ORIGIN}/#vouchers`, 'navigate'), ORIGIN, SHELL)).toBe('page');
  });

  it('never keeps the records, the sign-in, another site or anything not fetched plainly', () => {
    expect(routeFor(get('https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?VER=8'), ORIGIN, SHELL)).toBe('network');
    expect(routeFor(get('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=k'), ORIGIN, SHELL)).toBe('network');
    expect(routeFor(get('https://securetoken.googleapis.com/v1/token'), ORIGIN, SHELL)).toBe('network');
    expect(routeFor(get('https://api.github.com/repos/Deign86/x/releases/latest'), ORIGIN, SHELL)).toBe('network');
    expect(routeFor(get(`${ORIGIN}/__/auth/handler`, 'navigate'), ORIGIN, SHELL)).toBe('network');
    expect(routeFor({ url: `${ORIGIN}/assets/index-3f9a.js`, method: 'POST', mode: 'cors' }, ORIGIN, SHELL)).toBe('network');
    // A file of another build, or one the build does not have.
    expect(routeFor(get(`${ORIGIN}/assets/index-0000.js`), ORIGIN, SHELL)).toBe('network');
    expect(routeFor(get('not a url'), ORIGIN, SHELL)).toBe('network');
  });

  it('drops every older build\'s shell when a new one takes over, and nothing else', () => {
    expect(cacheName('a1b2c3d')).toBe('keystone-shell-a1b2c3d');
    expect(staleCaches(['keystone-shell-0ld0ld0', 'keystone-shell-a1b2c3d', 'someone-else'], 'a1b2c3d')).toEqual(['keystone-shell-0ld0ld0']);
  });
});

/** A browser's service worker container, with one registration whose newer worker may be waiting. */
function workers({ waiting, offline = false, registered = true }: { waiting?: string; offline?: boolean; registered?: boolean } = {}) {
  const said: unknown[] = [];
  const takenOver: (() => void)[] = [];

  const worker: WorkerHandle | null = waiting === undefined ? null : {
    state: 'installed',
    addEventListener() {},
    postMessage(message: WorkerMessage, ports?: Transferable[]) {
      said.push(message.type);

      if (message.type === 'version' && ports?.[0] instanceof MessagePort) ports[0].postMessage(waiting);

      // Taking over, as the browser then tells the page.
      if (message.type === 'skip-waiting') for (const l of takenOver) l();
    },
  };

  const registration: WorkerRegistration = {
    waiting: worker,
    installing: null,
    // Asking the server for the worker again: refused offline.
    update: async () => {
      if (offline) throw new TypeError('Failed to fetch');

      return registration;
    },
  };

  const container = {
    register: vi.fn(async () => registration),
    getRegistration: async () => (registered ? registration : undefined),
    addEventListener: (_: string, l: () => void) => { takenOver.push(l); },
  } satisfies WorkerContainer;

  return { container, registration, said };
}

describe('the web app\'s updates', () => {
  it('registers the worker at the root, and works on without one where the browser refuses it', async () => {
    const { container } = workers();

    expect(WORKER_URL).toBe('/sw.js');
    await startServiceWorker(container);
    expect(container.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });

    vi.mocked(container.register).mockRejectedValueOnce(new DOMException('The operation is insecure.', 'SecurityError'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await startServiceWorker(container)).toBe(false);
    expect(await startServiceWorker(undefined)).toBe(false);
  });

  it('offers the newer build the worker has kept, by its name, and starts it on install', async () => {
    const { container, said } = workers({ waiting: 'b2c3d4e' });
    const reload = vi.fn();
    const updater = webUpdater(container, 'a1b2c3d', reload);

    expect(await updater.currentVersion()).toBe('a1b2c3d');
    const update = await updater.check();

    expect(update?.version).toBe('b2c3d4e');
    const progress: (number | null)[] = [];

    await update?.install((done) => progress.push(done));
    expect(said).toEqual(['version', 'skip-waiting']);
    expect(progress).toEqual([1]);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('offers nothing when no newer build is waiting, and lets a waiting worker of this very build take over quietly', async () => {
    expect(await webUpdater(workers().container, 'a1b2c3d', vi.fn()).check()).toBeNull();
    const same = workers({ waiting: 'a1b2c3d' });
    const reload = vi.fn();

    expect(await webUpdater(same.container, 'a1b2c3d', reload).check()).toBeNull();
    expect(same.said).toEqual(['version', 'skip-waiting']);
    expect(reload).not.toHaveBeenCalled();
    expect(await webUpdater(workers({ registered: false }).container, 'a1b2c3d', vi.fn()).check()).toBeNull();
  });

  it('rejects when it cannot ask (offline), so the rail asks again later', async () => {
    await expect(webUpdater(workers({ waiting: 'b2c3d4e', offline: true }).container, 'a1b2c3d', vi.fn()).check()).rejects.toThrow('Failed to fetch');
  });
});

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36';

/** A browser to install from: its user agent, touch points, whether Keystone runs installed, and its events. */
function browserOf(userAgent: string, { touch = 5, standalone = false } = {}) {
  const listeners: Record<string, ((e: Event) => void)[]> = {};

  const host: InstallHost = {
    navigator: { userAgent, maxTouchPoints: touch },
    matchMedia: (q) => ({ matches: standalone && q === '(display-mode: standalone)' }),
    addEventListener: (type, l) => { (listeners[type] ??= []).push(l); },
  };

  const fire = (type: string, e: Event) => { for (const l of listeners[type] ?? []) l(e); };

  return { host, fire };
}

/** The browser's offer to install, as Chrome makes it, answered `outcome`. */
function offer(outcome: 'accepted' | 'dismissed') {
  return Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn(async () => {}),
    userChoice: Promise.resolve({ outcome }),
  });
}

describe('installing the web app', () => {
  it('points an iPhone or iPad to the Share menu, and offers nothing elsewhere until the browser does', () => {
    expect(webInstaller(browserOf(IPHONE).host).way()).toBe('share-menu');
    // iPadOS says it is a Mac; its touch screen gives it away.
    expect(isAppleMobile({ userAgent: IPAD, maxTouchPoints: 5 })).toBe(true);
    expect(isAppleMobile({ userAgent: IPAD, maxTouchPoints: 0 })).toBe(false);
    expect(webInstaller(browserOf(ANDROID).host).way()).toBeNull();
    expect(webInstaller(browserOf(IPHONE, { standalone: true }).host).way()).toBeNull();
  });

  it('holds the browser\'s offer for the rail, opens it when asked, and offers nothing once installed', async () => {
    const { host, fire } = browserOf(ANDROID);
    const installer = webInstaller(host);
    const changed = vi.fn();
    const stop = installer.watch(changed);
    const asked = offer('accepted');

    fire('beforeinstallprompt', asked);
    expect(asked.defaultPrevented).toBe(true);
    expect(installer.way()).toBe('prompt');
    expect(changed).toHaveBeenCalledTimes(1);

    expect(await installer.prompt()).toBe(true);
    expect(asked.prompt).toHaveBeenCalledOnce();
    // An offer is shown once.
    expect(installer.way()).toBeNull();
    expect(await installer.prompt()).toBe(false);

    fire('appinstalled', new Event('appinstalled'));
    expect(installer.way()).toBeNull();
    stop();
    fire('beforeinstallprompt', offer('dismissed'));
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it('says so when the person dismisses the browser\'s dialog', async () => {
    const { host, fire } = browserOf(ANDROID);
    const installer = webInstaller(host);

    fire('beforeinstallprompt', offer('dismissed'));
    expect(await installer.prompt()).toBe(false);
  });
});

describe('how the web app is served', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
  const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

  it('is installable: a manifest in the house colours with maskable icons, and the iPhone\'s own tags', () => {
    const manifest = JSON.parse(read('apps/keystone/public/manifest.webmanifest'));
    const tokens = JSON.parse(read('shared/design/tokens.json'));

    expect(manifest).toMatchObject({ id: '/', start_url: '/', scope: '/', display: 'standalone', short_name: 'Keystone', theme_color: tokens.color.bg, background_color: tokens.color.bg });
    expect(manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes} ${i.purpose}`)).toEqual(['192x192 any', '512x512 any', '192x192 maskable', '512x512 maskable']);

    const page = read('apps/keystone/index.html');

    for (const tag of ['rel="manifest" href="/manifest.webmanifest"', 'rel="apple-touch-icon"', 'name="apple-mobile-web-app-capable" content="yes"', 'name="theme-color"', 'viewport-fit=cover']) {
      expect(page).toContain(tag);
    }
  });

  it('on Vercel: built with build:web, every address opens the app, the page and the worker are never kept stale, the hashed files forever', () => {
    const vercel = JSON.parse(read('vercel.json'));

    const headerOf = (path: string, key: string) => vercel.headers
      .filter((h: { source: string }) => new RegExp(`^${h.source.replace(/\(\.\*\)/g, '.*')}$`).test(path))
      .flatMap((h: { headers: { key: string; value: string }[] }) => h.headers)
      .filter((h: { key: string }) => h.key === key)
      .map((h: { value: string }) => h.value);

    expect(vercel).toMatchObject({ buildCommand: 'npm run build:web', outputDirectory: 'apps/keystone/dist' });
    expect(vercel.rewrites).toEqual([expect.objectContaining({ destination: '/index.html' })]);
    expect(headerOf('/index.html', 'Cache-Control')).toEqual(['no-cache']);
    expect(headerOf('/', 'Cache-Control')).toEqual(['no-cache']);
    expect(headerOf('/sw.js', 'Cache-Control')).toEqual(['no-cache, no-store, must-revalidate']);
    expect(headerOf('/assets/index-3f9a.js', 'Cache-Control')).toEqual(['public, max-age=31536000, immutable']);
    expect(headerOf('/manifest.webmanifest', 'Content-Type')).toEqual(['application/manifest+json']);
  });
});
