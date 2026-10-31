// Every package that has tests carries its own vitest config; `npm test` runs them all.
export default [
  'packages/*/vitest.config.ts',
  'packages/modules/*/vitest.config.ts',
  'packages/connectors/*/vitest.config.ts',
  'apps/keystone/vite.config.ts',
];
