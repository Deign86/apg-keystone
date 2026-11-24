import { readdirSync } from 'node:fs';
import tailwind from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { partTest } from '../../vitest.shared';

/**
 * This build's name: the commit it was built from (Vercel and GitHub Actions say which), else the time of the build. The
 * web app's service worker keeps its files under it and the rail shows it as the version (docs/adr/0046).
 */
const build = (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? '').slice(0, 7) || Date.now().toString(36);

/**
 * The web app's service worker (src/platform/service-worker.ts), built beside the page as /sw.js, with this build's
 * name and every file of its shell (the page, its scripts, styles, fonts and images, and public/) written in, so it
 * can keep them for a fast and offline start. Only `vite build` makes it; the dev server has none.
 */
function serviceWorker(): Plugin {
  return {
    name: 'keystone-service-worker',
    apply: 'build',
    config: () => ({
      build: {
        rollupOptions: {
          input: { index: 'index.html', sw: 'src/platform/service-worker.ts' },
          output: { entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js') },
        },
      },
    }),
    generateBundle(_, bundle) {
      const worker = bundle['sw.js'];

      if (worker?.type !== 'chunk') throw new Error('The service worker was not built.');

      if (worker.imports.length) throw new Error(`The service worker must stand alone, but it imports ${worker.imports.join(', ')}.`);
      const built = Object.keys(bundle).filter((f) => f !== 'sw.js' && !f.endsWith('.map'));
      const shell = [...built, ...readdirSync(new URL('./public/', import.meta.url))].map((f) => `/${f}`).sort();

      worker.code = worker.code
        .replace(/(["'`])__KEYSTONE_SHELL__\1/, JSON.stringify(JSON.stringify(shell)))
        .replace(/__KEYSTONE_BUILD__/, build);
    },
  };
}

// Tauri serves the built files; in development it points at this dev server.
export default defineConfig({
  plugins: [react(), tailwind(), serviceWorker()],
  clearScreen: false,
  define: { 'import.meta.env.VITE_KEYSTONE_BUILD': JSON.stringify(build) },
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
  build: { target: 'es2022', reportCompressedSize: false, chunkSizeWarningLimit: 1500 },
  test: partTest,
});
