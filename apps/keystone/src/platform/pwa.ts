import type { AppInstaller, AppUpdater, InstallWay } from '@keystone/kit';

// The web app as an installable app (docs/adr/0047): its service worker (service-worker.ts, built as /sw.js), the
// newer build that worker has fetched, offered in the rail as the desktop app offers its updates, and adding Keystone
// to a phone's or tablet's home screen. Only a built web app has any of this: not the desktop app, which Tauri serves
// from its own files, and not the dev server, which has no worker.

/** Where the build puts the worker (vite.config.ts). At the root, so it serves every address of the app. */
export const WORKER_URL = '/sw.js';

/** How long a waiting worker has to say its build, and to take over, before Keystone gives up and says so. */
const ANSWER_MS = 5_000;

/** What the page says to the worker (service-worker.ts): ask its build's name, or tell it to take over. */
export interface WorkerMessage {
  type: 'version' | 'skip-waiting';
}

/** What the page uses of a service worker: the browser's `ServiceWorker`. */
export interface WorkerHandle {
  readonly state: ServiceWorkerState;
  postMessage(message: WorkerMessage, transfer?: Transferable[]): void;
  addEventListener(type: 'statechange', listener: () => void): void;
}

/** What the page uses of the worker's registration: the browser's `ServiceWorkerRegistration`. */
export interface WorkerRegistration {
  readonly waiting: WorkerHandle | null;
  readonly installing: WorkerHandle | null;
  update(): Promise<object>;
}

/** What the page uses of `navigator.serviceWorker`. */
export interface WorkerContainer {
  register(url: string, options: RegistrationOptions): Promise<object>;
  getRegistration(): Promise<WorkerRegistration | undefined>;
  addEventListener(type: 'controllerchange', listener: () => void, options?: AddEventListenerOptions): void;
}

/** Registers the worker. False where the browser has none or refuses it (a private window): Keystone works without. */
export async function startServiceWorker(container: WorkerContainer | undefined): Promise<boolean> {
  if (!container) return false;

  try {
    await container.register(WORKER_URL, { scope: '/' });

    return true;
  } catch (cause) {
    console.warn('Keystone could not keep its files on this device, so it needs the network to open.', cause);

    return false;
  }
}

const withinTime = <T>(work: Promise<T>, what: string) => Promise.race([
  work,
  new Promise<never>((_, refuse) => { setTimeout(() => refuse(new Error(`${what} took too long.`)), ANSWER_MS); }),
]);

/** The build a worker keeps, as it says when asked. */
function buildOf(worker: WorkerHandle): Promise<string> {
  const channel = new MessageChannel();
  const answer = new Promise<string>((resolve) => { channel.port1.onmessage = (e) => resolve(String(e.data)); });

  worker.postMessage({ type: 'version' }, [channel.port2]);

  return withinTime(answer, 'Asking the new version its name');
}

/** The worker of a newer build once it has fetched every file, or null when there is none or it failed. */
function readyWorker(registration: WorkerRegistration): Promise<WorkerHandle | null> {
  if (registration.waiting) return Promise.resolve(registration.waiting);
  const installing = registration.installing;

  if (!installing) return Promise.resolve(null);

  return new Promise((resolve) => {
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed') resolve(installing);

      if (installing.state === 'redundant') resolve(null);
    });
  });
}

/**
 * Keystone's updates in the web app: a newer build is one the server has and the worker has fetched and kept, waiting
 * to take over. Installing it lets it take over and reopens Keystone on it. `current` is this build's name.
 */
export function webUpdater(container: WorkerContainer, current: string, reload: () => void): AppUpdater {
  return {
    currentVersion: async () => current,
    async check() {
      const registration = await container.getRegistration();

      if (!registration) return null;
      // Throws when offline: the rail says nothing and asks again later.
      await registration.update();
      const waiting = await readyWorker(registration);

      if (!waiting) return null;
      const version = await buildOf(waiting);

      // This page already runs that build (it was first opened from the network): the worker simply takes over.
      if (version === current) {
        waiting.postMessage({ type: 'skip-waiting' });

        return null;
      }

      return {
        version,
        async install(onProgress) {
          // Nothing to download: the worker fetched it all before it said it was ready.
          onProgress(1);
          const takenOver = new Promise<void>((resolve) => container.addEventListener('controllerchange', () => resolve(), { once: true }));

          waiting.postMessage({ type: 'skip-waiting' });
          await withinTime(takenOver, `Starting Keystone ${version}`);
          reload();
        },
      };
    },
  };
}

/** The browser's offer to install, held until the person asks for it (Chrome and Edge). */
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** What the installer reads of the browser. */
export interface InstallHost {
  readonly navigator: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> & { standalone?: boolean };
  matchMedia(query: string): Pick<MediaQueryList, 'matches'>;
  addEventListener(type: 'beforeinstallprompt' | 'appinstalled', listener: (event: Event) => void): void;
}

/** True on an iPhone or iPad, where a web app is installed by hand from the Share menu. iPadOS says it is a Mac. */
export const isAppleMobile = (nav: InstallHost['navigator']) =>
  /iPhone|iPad|iPod/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);

/** True when Keystone is already running as an installed app, opened from the home screen. */
export const isInstalled = (host: InstallHost) =>
  host.matchMedia('(display-mode: standalone)').matches || host.navigator.standalone === true;

/**
 * Adding the web app to the home screen. Made as Keystone starts, before anything is drawn, so the browser's offer is
 * caught whenever it comes.
 */
export function webInstaller(host: InstallHost): AppInstaller {
  let offer: InstallPrompt | null = null;
  let installed = isInstalled(host);
  const watchers = new Set<() => void>();
  const changed = () => { for (const w of watchers) w(); };

  host.addEventListener('beforeinstallprompt', (event) => {
    // The browser's own banner waits: the rail offers it instead, where the person asks for it.
    event.preventDefault();
    // SAFETY: the browser fires beforeinstallprompt only as a BeforeInstallPromptEvent, which has prompt and userChoice.
    offer = event as InstallPrompt;
    changed();
  });
  host.addEventListener('appinstalled', () => {
    installed = true;
    offer = null;
    changed();
  });

  return {
    way(): InstallWay | null {
      if (installed) return null;

      if (offer) return 'prompt';

      return isAppleMobile(host.navigator) ? 'share-menu' : null;
    },
    watch(onChange) {
      watchers.add(onChange);

      return () => watchers.delete(onChange);
    },
    async prompt() {
      const asked = offer;

      if (!asked) return false;
      // An offer can be shown once.
      offer = null;
      changed();
      await asked.prompt();

      return (await asked.userChoice).outcome === 'accepted';
    },
  };
}
