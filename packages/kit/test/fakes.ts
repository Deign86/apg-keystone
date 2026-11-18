import type { Connector } from '@keystone/core';

// The platform held in memory is the one the parts' tests use too (`@keystone/kit/testing`).
export { memoryPlatform } from '../testing';

/** A connector that opens without a word, to be overridden per test. */
export const okConnector = (id: string, extra: Partial<Connector> = {}): Connector => ({
  id, name: id, logo: `${id}.png`, open: async () => {}, ...extra,
});
