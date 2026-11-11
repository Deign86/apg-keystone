import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// The browser dev server both suites start: apps/keystone's own Vite (not the one vitest brings), run with this Node.
// Not `npm run dev`: on Windows npm is a .cmd shim the runner cannot start, and stopping a wrapper there would leave
// Vite running, since Windows has no process groups.
const appRequire = createRequire(new URL('../../apps/keystone/package.json', import.meta.url));
const vite = join(dirname(appRequire.resolve('vite/package.json')), 'bin', 'vite.js');

/** The dev server on the port the run picks, built with these VITE_FIREBASE_* variables, logging to `log`. */
export function devServer(firebase: Record<string, string>, log: string) {
  return {
    executable: process.execPath,
    args: [vite, '--port', '{port}'],
    cwd: 'apps/keystone',
    env: firebase,
    log,
  };
}
