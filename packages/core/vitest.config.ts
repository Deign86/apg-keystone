import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Pin the zone so date and clock tests read the same on every machine.
    env: { TZ: 'Asia/Manila' },
  },
});
