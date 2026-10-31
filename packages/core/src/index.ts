import seedJson from './seed.json';
import type { Seed } from './kernel/schema';

// @keystone/core is the kernel: what every part of Keystone may rely on, and nothing else.
export * from './kernel/money';

export * from './kernel/dates';

export * from './kernel/format';

export * from './kernel/schema';

export * from './kernel/state';

export * from './kernel/lines';

export * from './kernel/insight';

export * from './kernel/connectors';

export * from './kernel/services';

// The directory is the shared kernel every area refers to by code (docs/adr/0003).
export * from './kernel/directory';

// Rules for each area live in that area's module package (packages/modules/*), not here.

/** The sample data (generated from shared/data/seed.json by `npm run sync`): company details, reference lists and the sample records. */
export const bundledSeed = seedJson as unknown as Seed;
