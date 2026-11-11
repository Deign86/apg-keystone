import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { devServer } from './e2e/support/dev-server';

// The cloud build (docs/adr/0009) end to end: signing in, moving a computer's records in, saving to the cloud and
// opening the same records on another computer, against the Firebase Auth and Firestore emulators with the real
// firestore.rules. Run it with `npm run test:e2e:cloud`: `firebase emulators:exec` starts the emulators
// (e2e.firebase.json) for the run, names them in FIREBASE_AUTH_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST, and stops
// them after. The project is a demo one, which exists only in the emulators, so nothing here reaches a real Firebase
// project or account (apps/keystone/src/platform/config.ts › firebaseEmulators).
//
// The tests share the emulators and empty them as they start, so they run one at a time. They keep the main suite's
// clock and time zone (e2e.config.ts).
const project = process.env.GCLOUD_PROJECT ?? '';
const auth = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '';
const firestore = process.env.FIRESTORE_EMULATOR_HOST ?? '';

if (!project.startsWith('demo-') || !auth || !firestore) {
  throw new Error('The cloud suite needs the Firebase emulators of a demo project: run it with npm run test:e2e:cloud.');
}

const cdpEndpoint = process.env.E2E_CDP_ENDPOINT;
const connect = cdpEndpoint ? { cdpEndpoint: () => cdpEndpoint } : undefined;

export default {
  tests: 'e2e/cloud/**/*.e2e.ts',
  output: '.e2e/cloud',
  workers: 1,
  targets: [
    {
      name: 'cloud',
      engine: web({
        timezoneId: 'Asia/Manila',
        initScripts: [{ path: 'e2e/support/fixed-clock.js' }],
        connect,
      }),
      app: {
        url: 'http://127.0.0.1:0',
        identity: 'keystone-cloud',
        command: devServer(
          {
            VITE_FIREBASE_API_KEY: 'demo',
            VITE_FIREBASE_PROJECT_ID: project,
            VITE_FIREBASE_APP_ID: 'demo',
            VITE_FIREBASE_AUTH_DOMAIN: '',
            VITE_FIREBASE_AUTH_EMULATOR: auth,
            VITE_FIREBASE_FIRESTORE_EMULATOR: firestore,
          },
          '.e2e/logs/cloud.log',
        ),
      },
    },
  ],
} satisfies E2EConfig;
