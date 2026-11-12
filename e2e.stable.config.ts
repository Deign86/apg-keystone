import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { devServer } from './e2e/support/dev-server';

// A build that is not a beta (docs/adr/0017): only the released screens open, the others say "Coming soon". The main
// suite (e2e.config.ts) runs the dev server, which is a beta and opens every screen; this one runs it with
// VITE_KEYSTONE_CHANNEL=stable, as a release is built. Run it with `npm run test:e2e:stable` (part of
// `npm run test:e2e`). Same sample data, clock and time zone as the main suite; records kept in the browser.
const cdpEndpoint = process.env.E2E_CDP_ENDPOINT;
const connect = cdpEndpoint ? { cdpEndpoint: () => cdpEndpoint } : undefined;

export default {
  tests: 'e2e/stable/**/*.e2e.ts',
  output: '.e2e/stable',
  targets: [
    {
      name: 'stable',
      engine: web({
        timezoneId: 'Asia/Manila',
        initScripts: [{ path: 'e2e/support/fixed-clock.js' }],
        connect,
      }),
      app: {
        url: 'http://127.0.0.1:0',
        identity: 'keystone-stable',
        command: devServer(
          {
            VITE_KEYSTONE_CHANNEL: 'stable',
            VITE_FIREBASE_API_KEY: '', VITE_FIREBASE_PROJECT_ID: '', VITE_FIREBASE_APP_ID: '', VITE_FIREBASE_AUTH_DOMAIN: '',
          },
          '.e2e/logs/stable.log',
        ),
      },
    },
  ],
} satisfies E2EConfig;
