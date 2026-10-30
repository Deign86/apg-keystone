import seedJson from '../../../shared/data/seed.json';
import type { Seed } from './models';

export * from './money';
export * from './dates';
export * from './format';
export * from './models';
export * from './terminal';
export * from './overview';
export * from './verification';
export * from './connectors';

/** shared/data/seed.json: company details, reference lists and the sample records. */
export const bundledSeed = seedJson as unknown as Seed;
