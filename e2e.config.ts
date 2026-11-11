import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { devServer } from './e2e/support/dev-server';

// End-to-end tests drive Keystone's screens in Chromium against the browser dev server
// (`npm run dev`, the same UI the Tauri shell shows, on the browser platform). No model is
// configured, so tests use exact locators and assertions only. To add agent.* steps, pick a
// provider as in .agents/skills/e2e/references/setup.md › Subscriptions and API keys.
//
// Every test starts from the sample data (each test gets a fresh browser context, so nothing it
// saves carries over) at 10:00 on Nov 2, 2026 in Manila (e2e/support/fixed-clock.js), so dates,
// overdue statements and the greeting read the same on every run.
//
// The run starts its own dev server on a free port, never one already running: that one may be a
// cloud build (apps/keystone/.env.local naming a Firebase project), which opens on the sign-in
// screen. The VITE_FIREBASE_* variables are blanked for the same reason, so .env.local is ignored.
// The cloud build has its own suite: e2e.cloud.config.ts.
//
// E2E_CDP_ENDPOINT (for example http://127.0.0.1:9222) attaches to a Chromium that is
// already running instead of launching one: useful where the browser download is blocked.
const cdpEndpoint = process.env.E2E_CDP_ENDPOINT;
const connect = cdpEndpoint ? { cdpEndpoint: () => cdpEndpoint } : undefined;

export default {
  tests: ['e2e/**/*.e2e.ts', '!e2e/cloud/**'],
  targets: [
    {
      engine: web({
        timezoneId: 'Asia/Manila',
        initScripts: [{ path: 'e2e/support/fixed-clock.js' }],
        connect,
      }),
      app: {
        url: 'http://127.0.0.1:0',
        identity: 'keystone',
        command: devServer(
          { VITE_FIREBASE_API_KEY: '', VITE_FIREBASE_PROJECT_ID: '', VITE_FIREBASE_APP_ID: '', VITE_FIREBASE_AUTH_DOMAIN: '' },
          '.e2e/logs/app.log',
        ),
      },
    },
  ],
} satisfies E2EConfig;
