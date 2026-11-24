import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { devServer } from './e2e/support/dev-server';
import { sampleRecords } from './e2e/support/sample-records';
import { useUtf8Locale } from './e2e/support/locale';
import { ANDROID_TABLET, IPHONE, touchScreen } from './e2e/support/touch';

// The web app on phones and tablets (docs/adr/0046): every screen and its flows worked by a finger, as on the desktop.
// Every test runs on both targets: an iPhone upright (390 × 844, under 768px, so the rail is behind the Menu button)
// and an Android tablet upright (768 × 1024, with the rail). `e2e/mobile/layout.e2e.ts` also walks every screen at every
// phone and tablet size, upright and on its side (e2e/support/touch.ts › SIZES). Run it with `npm run test:e2e:mobile`
// (part of `npm run test:e2e`). Same sample data, clock, time zone and dev server as the main suite (e2e.config.ts).
const cdpEndpoint = process.env.E2E_CDP_ENDPOINT;
const connect = cdpEndpoint ? { cdpEndpoint: () => cdpEndpoint } : undefined;

// A download keeps its name, en dash and all, on a machine with no UTF-8 locale too (e2e/support/locale.ts).
useUtf8Locale();

const app = {
  url: 'http://127.0.0.1:0',
  identity: 'keystone-mobile',
  command: devServer(
    { VITE_FIREBASE_API_KEY: '', VITE_FIREBASE_PROJECT_ID: '', VITE_FIREBASE_APP_ID: '', VITE_FIREBASE_AUTH_DOMAIN: '' },
    '.e2e/logs/mobile.log',
  ),
};

const device = (viewport: { width: number; height: number }, userAgent: string) => web({
  timezoneId: 'Asia/Manila',
  viewport,
  userAgent,
  initScripts: [{ path: 'e2e/support/fixed-clock.js' }, sampleRecords, touchScreen],
  connect,
});

export default {
  tests: 'e2e/mobile/**/*.e2e.ts',
  output: '.e2e/mobile',
  targets: [
    { name: 'phone', engine: device({ width: 390, height: 844 }, IPHONE), app },
    { name: 'tablet', engine: device({ width: 768, height: 1024 }, ANDROID_TABLET), app },
  ],
} satisfies E2EConfig;
