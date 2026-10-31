import { fileURLToPath } from 'node:url';

/** Test settings shared by every package with React screens or connectors. */
export const partTest = {
  environment: 'jsdom' as const,
  globals: true,
  // Pin the zone so dates and clocks read the same on every machine.
  env: { TZ: 'Asia/Manila' },
  setupFiles: [fileURLToPath(new URL('./packages/kit/test/setup.ts', import.meta.url))],
};
