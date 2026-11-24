// Keystone's service worker, for the web app (docs/adr/0047). Built by vite.config.ts as /sw.js, with the build's name
// and its shell's files written in where the two markers below are. It keeps the app shell, so Keystone opens fast,
// and opens offline; it never keeps the records, Firebase's sign-in or anything from another site (sw-routes.ts).
//
// A new build waits until Keystone asks it to take over (the rail's update notice, platform/pwa.ts), so a page open on
// the old build never loses the files it still loads.

import { cacheName, PAGE, routeFor, staleCaches } from './sw-routes';

/** The parts of the worker's global scope used here; the page's TypeScript setup does not know worker types. */
interface WorkerScope {
  location: { origin: string };
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  addEventListener(type: 'install' | 'activate', listener: (event: { waitUntil(work: Promise<unknown>): void }) => void): void;
  addEventListener(type: 'fetch', listener: (event: { request: Request; respondWith(answer: Promise<Response>): void }) => void): void;
  addEventListener(type: 'message', listener: (event: { data: unknown; ports: readonly MessagePort[] }) => void): void;
}

// This file only ever runs as a service worker (vite.config.ts builds it as /sw.js, platform/pwa.ts registers it), whose
// global scope has everything WorkerScope lists.
declare const self: WorkerScope;
const worker = self;

/** Written in by the build: its name, and the paths of its shell's files as JSON. */
const BUILD = '__KEYSTONE_BUILD__';
const SHELL: string[] = JSON.parse('__KEYSTONE_SHELL__');

const shell = new Set([...SHELL, PAGE, '/']);
const cache = cacheName(BUILD);

worker.addEventListener('install', (event) => {
  // Fetched past the browser's own cache, so what is kept is exactly this build's.
  event.waitUntil(caches.open(cache).then((c) => c.addAll([...new Set([...SHELL, PAGE])].map((path) => new Request(path, { cache: 'reload' })))));
});

worker.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(staleCaches(names, BUILD).map((n) => caches.delete(n)))).then(() => worker.clients.claim()));
});

worker.addEventListener('message', (event) => {
  // SAFETY: only Keystone's own page (platform/pwa.ts) posts to its worker, always an object with a `type`.
  const data = event.data as { type?: string } | null;


  if (data?.type === 'version') event.ports[0]?.postMessage(BUILD);

  if (data?.type === 'skip-waiting') void worker.skipWaiting();
});

const kept = (path: string) => caches.open(cache).then((c) => c.match(path));

worker.addEventListener('fetch', (event) => {
  const route = routeFor(event.request, worker.location.origin, shell);

  if (route === 'network') return;

  if (route === 'shell') {
    const path = new URL(event.request.url).pathname;

    event.respondWith(kept(path === '/' ? PAGE : path).then((hit) => hit ?? fetch(event.request)));

    return;
  }

  // Opening Keystone: this build's own page, kept with its files, so it opens at once, offline too, and never mixes
  // with a newer build's files. A newer build comes through the rail's update notice.
  event.respondWith(kept(PAGE).then((hit) => hit ?? fetch(event.request)));
});
