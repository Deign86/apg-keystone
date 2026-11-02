import type { Platform } from '@keystone/kit';

// The browser preview: everything that does not need the desktop works; the rest says so.

const KEY = 'keystone-state';
const NEEDS_DESKTOP = 'This needs the Keystone desktop app.';

const store = {
  get(key: string) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string | null) {
    try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* private mode */ }
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
  loadState: async () => store.get(KEY),
  saveState: async (json) => store.set(KEY, json),
  putPhoto: async (name, bytes) => { await photoOp('readwrite', (s) => s.put(new Blob([bytes.slice()]), name)); },
  photoUrl: async (name) => {
    const blob = await photoOp<Blob | undefined>('readonly', (s) => s.get(name)).catch(() => undefined);

    return blob ? URL.createObjectURL(blob) : null;
  },
  saveFile: async (name, bytes) => {
    const url = URL.createObjectURL(new Blob([bytes.slice()]));
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
};
