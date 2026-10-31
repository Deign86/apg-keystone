import type { HttpClient, HttpResponse } from '@keystone/core';
import type { Platform } from '@keystone/kit';

// The browser preview: everything that does not need the desktop works; the rest says so.

const KEY = 'keystone-state';
const SETTINGS = 'keystone-connections';
const NEEDS_DESKTOP = 'This needs the Keystone desktop app.';

const store = {
  get(key: string) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string | null) {
    try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* private mode */ }
  },
};

function response(r: Response): HttpResponse {
  return {
    status: r.status, ok: r.ok,
    text: () => r.text(),
    json: <T,>() => r.json() as Promise<T>,
    bytes: async () => new Uint8Array(await r.arrayBuffer()),
  };
}

const http: HttpClient = {
  native: false,
  async request(url, init = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 10000);

    try {
      return response(await fetch(url, { method: init.method ?? 'GET', headers: init.headers, body: init.body, signal: ctrl.signal }));
    } finally {
      clearTimeout(timer);
    }
  },
};

// Photos in IndexedDB, so they survive reloads of the preview.
function photoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('keystone-photos', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('photos');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function photoOp<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await photoDb();

  return new Promise((resolve, reject) => {
    const req = op(db.transaction('photos', mode).objectStore('photos'));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function pick(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export const browserPlatform: Platform = {
  kind: 'browser',
  platform: 'web',
  http,
  loadState: async () => store.get(KEY),
  saveState: async (json) => store.set(KEY, json),
  loadSettings: async () => JSON.parse(store.get(SETTINGS) ?? '{}'),
  saveSettings: async (s) => store.set(SETTINGS, JSON.stringify(s)),
  // Session-only in the preview: never keep passwords in a browser's storage.
  secret: async (key) => sessionStorage.getItem(`keystone-secret:${key}`),
  setSecret: async (key, value) => {
    if (value === null) sessionStorage.removeItem(`keystone-secret:${key}`);
    else sessionStorage.setItem(`keystone-secret:${key}`, value);
  },
  putPhoto: async (name, bytes) => { await photoOp('readwrite', (s) => s.put(new Blob([bytes as BlobPart]), name)); },
  photoUrl: async (name) => {
    const blob = await photoOp<Blob | undefined>('readonly', (s) => s.get(name)).catch(() => undefined);

    return blob ? URL.createObjectURL(blob) : null;
  },
  saveFile: async (name, bytes) => {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    return name;
  },
  openFile: async (filters) => {
    const file = await pick(filters.flatMap((f) => f.extensions.map((e) => `.${e}`)).join(','));

    return file ? { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } : null;
  },
  locateApp: async () => null,
  launchApp: async () => { throw new Error(NEEDS_DESKTOP); },
  openUrl: async (url) => { window.open(url, '_blank', 'noopener'); },
  pickFiles: async () => { throw new Error(NEEDS_DESKTOP); },
  readFile: async () => { throw new Error(NEEDS_DESKTOP); },
  listFiles: async () => [],
  appDataFolder: async () => null,
};
