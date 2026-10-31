import type { Centavos } from './money';
import type { Status, Tone } from './schema';

// How a domain tells the rest of the app what matters, without the rest of the app
// knowing the domain exists. Overview and Home collect these from whatever modules are
// installed; take a module out and its figures and findings simply stop appearing.

/** One figure in a strip: label, value, and what the value counts. */
export interface Figure {
  label: string;
  value: string;
  caption: string;
  /** The figure that answers the screen's question is drawn larger. */
  lead?: boolean;
}

/** The one sentence about what most needs attention. Higher priority wins. */
export interface Finding {
  priority: number;
  text: string;
}

/** A record waiting on someone (a voucher to sign, a statement to collect). */
export interface WaitingItem {
  /** The record's number, also its key. */
  no: string;
  /** Who it concerns, and any short context: "Harbor Point Logistics Corp. · due Nov 5, 2026". */
  who: string;
  amount: Centavos | null;
  status: Status;
  tone: Tone;
  /** Sorts the combined list: lower comes first. */
  rank: number;
}

export const IDLE_FINDING = 'Nothing is waiting on you.';

/** The highest-priority finding, or the idle sentence. */
export function topFinding(findings: (Finding | null | undefined)[]): string {
  const best = findings.filter((f): f is Finding => !!f).sort((a, b) => b.priority - a.priority)[0];

  return best?.text ?? IDLE_FINDING;
}
