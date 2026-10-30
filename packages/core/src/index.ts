import seedJson from '../../../shared/data/seed.json';
import type { Seed } from './kernel/schema';

// The kernel: what every part of Keystone may rely on.
export * from './kernel/money';
export * from './kernel/dates';
export * from './kernel/format';
export * from './kernel/schema';
export * from './kernel/state';
export * from './kernel/lines';
export * from './kernel/insight';
export * from './kernel/connectors';

// The domains: one file each. A domain imports the kernel and, at most, the directory.
export * from './domains/directory';
export * from './domains/vouchers';
export * from './domains/billing';
export * from './domains/ids';
export * from './domains/verification';

/** shared/data/seed.json: company details, reference lists and the sample records. */
export const bundledSeed = seedJson as unknown as Seed;
