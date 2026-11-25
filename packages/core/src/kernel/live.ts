import { count } from './format';
import type { LogEntry } from './schema';
import type { Member } from './state';

// Live updates (docs/adr/0049): what others save reaches every Keystone that is open, as it is saved, and the person is
// told what arrived. What they are told is the Activity Log line of each change, the sentence the rule that made it
// wrote, with who made it.

/** How often a Keystone whose live updates have stopped reads the records again, until they are back: two minutes. */
export const LIVE_REREAD_MS = 2 * 60 * 1000;

/** Shown in the rail while live updates are stopped. */
export const LIVE_PAUSED = 'Live updates are paused. Keystone checks the cloud for others\' changes every 2 minutes, and when you come back to it.';

/** More arrivals than this at once are told in one sentence, not one each. */
const TOLD_ONE_BY_ONE = 3;

const entryKey = (e: LogEntry) => `${e.when}\u0000${e.mod}\u0000${e.text}\u0000${e.by ?? ''}`;

/**
 * The Activity Log lines in `after` that `before` does not have: the changes someone else saved, oldest first. Each
 * line counts once, so a line both have, even repeated, is never new.
 */
export function newEntries(before: readonly LogEntry[], after: readonly LogEntry[]): LogEntry[] {
  const seen = new Map<string, number>();

  for (const e of before) seen.set(entryKey(e), (seen.get(entryKey(e)) ?? 0) + 1);

  const fresh = after.filter((e) => {
    const n = seen.get(entryKey(e)) ?? 0;

    if (n === 0) return true;
    seen.set(entryKey(e), n - 1);

    return false;
  });

  // The log is newest first; the person is told in the order the changes were made.
  return fresh.reverse();
}

/** Who saved an arrival, as the sentence names them: their name, or "another computer" for a line that names nobody. */
function whoSaved(e: LogEntry, me?: Member): string {
  if (!e.by) return 'another computer';

  return me && e.by === me.name ? 'you, on another computer' : e.by;
}

/**
 * What to tell the person of changes that arrived from elsewhere: each one's Activity Log line and who saved it ("From
 * Ana Cruz: 888-012 for MERALCO routed for approval (₱980.00)."), or, for more than three at once, how many and where
 * to read them.
 */
export function arrivalNotices(entries: readonly LogEntry[], me?: Member): string[] {
  if (!entries.length) return [];

  if (entries.length > TOLD_ONE_BY_ONE) {
    const names = [...new Set(entries.map((e) => whoSaved(e, me)))];
    const from = names.length === 1 ? names[0] : `${names.length} people`;

    return [`${count(entries.length, 'change')} arrived from ${from}. The Activity Log lists them.`];
  }

  return entries.map((e) => `From ${whoSaved(e, me)}: ${e.text}`);
}

/**
 * Said on a form when the record it holds was changed by someone else while it was open here: the form keeps what it
 * holds, and saving it writes that over their change.
 */
export function changedElsewhere(label: string): string {
  return `Someone else saved a change to ${label} while it was open here. This form still holds your version, and saving it replaces theirs; open ${label} again from the register to see theirs.`;
}
