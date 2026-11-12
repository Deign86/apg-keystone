import { parseState } from '../src/kernel/state';
import type { TerminalState } from '../src/kernel/schema';
import sample from './sample.json';

// The tests' sample records (generated from shared/data/sample.json by `npm run sync`): made-up records with APG's real
// company details. For tests only: Keystone itself never ships or shows them (docs/adr/0018), and
// `npm run check:boundaries` refuses this import anywhere but a test.

/** The sample records as saved text, as a computer or the browser would hold them. */
export const sampleText = JSON.stringify(sample);

/** A fresh copy of the sample records, read the way a saved state is. */
export const sampleState = (): TerminalState => parseState(sampleText);
