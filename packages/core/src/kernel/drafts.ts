import type { DocumentLayout } from './documents';
import type { JsonValue, TerminalState } from './schema';
import { stamp, shortDate } from './format';
import { isJsonObject, jsonObjects, jsonText, KeystoneError, moduleData, withModuleData, type Change, type Ctx } from './state';

// Saved drafts (docs/adr/0041): a form's work kept with the records so it can be finished later, on any computer. A
// draft is not a record: it has no number, writes nothing in the Activity Log and counts in no figure, finding or total.
// The kernel keeps them for every module, in two lists of its own under `state.ext`, by keys no module id can take:
// shared drafts, which every member reads (vouchers, statements: records everyone sees), and private ones, which only
// their author and an owner read (requests for funds, which only their requester and the CEO read). In the cloud each
// list is a collection with a document per draft (DRAFT_DOCUMENTS), and firestore.rules hold private ones to their author.

/** Where the drafts are kept under `state.ext`. A module id is lowercase letters, digits and dashes, so none is either. */
export const DRAFT_LISTS = { shared: '_drafts', private: '_mydrafts' } as const;

/** The saved drafts' collections in the cloud, a document per draft; a private draft names its author for the rules. */
export const DRAFT_DOCUMENTS: DocumentLayout = {
  [DRAFT_LISTS.shared]: { collection: 'drafts', list: 'items', key: 'id', fields: [] },
  [DRAFT_LISTS.private]: { collection: 'mydrafts', list: 'items', key: 'id', fields: ['uid'], readBy: 'uid' },
};

export type SavedDraft = {
  /** Unique across computers: the author, the module and a running number, "u7Kx…-billing-3" ("here-…" with no sign-in). */
  id: string;
  /** The module whose form it belongs to. */
  module: string;
  /** What the drafts list shows for it, from the module's rules: "Novatek BPO Solutions Inc. · ₱22,000.00". */
  title: string;
  /** When it was last saved, as the log writes a time: "2026-11-24 19:05". */
  saved: string;
  /** Who saved it last, by name; "" with nobody signed in. */
  by: string;
  /** Private drafts: the member who wrote it. Only they, and an owner, read it in the cloud. */
  uid?: string;
  /** The form's draft as it was, to put back in the form. */
  body: JsonValue;
};

/** A saved draft, field by field; one that is damaged past use (no id, module or body) is left out. */
function draftFrom(o: JsonValue): SavedDraft[] {
  if (!isJsonObject(o) || o.body === undefined) return [];
  const d: SavedDraft = { id: jsonText(o.id), module: jsonText(o.module), title: jsonText(o.title), saved: jsonText(o.saved), by: jsonText(o.by), body: o.body };
  const uid = jsonText(o.uid);

  if (uid) d.uid = uid;

  return d.id && d.module ? [d] : [];
}

const listOf = (s: TerminalState, key: string): SavedDraft[] => {
  const raw = moduleData(s, key);

  return isJsonObject(raw) ? jsonObjects(raw.items).flatMap(draftFrom) : [];
};

const withList = (s: TerminalState, key: string, items: SavedDraft[]) => withModuleData(s, key, { items });

/**
 * The drafts saved on a module's form that the person at this computer may open, newest first: the shared ones, and
 * their own private ones. In the cloud a member is sent only their own private drafts; an owner is sent everyone's, and
 * sees only their own here. With nobody signed in (the records on this computer), every draft on it is theirs.
 */
export function savedDrafts(s: TerminalState, module: string, ctx: Pick<Ctx, 'who'>): SavedDraft[] {
  const mine = (d: SavedDraft) => !ctx.who || d.uid === ctx.who.uid;
  const shared = listOf(s, DRAFT_LISTS.shared).filter((d) => d.module === module);
  const own = listOf(s, DRAFT_LISTS.private).filter((d) => d.module === module && mine(d));

  return [...shared, ...own].sort((a, b) => b.saved.localeCompare(a.saved));
}

export interface DraftToSave {
  module: string;
  /** Kept to its author: a request for funds. */
  private?: boolean;
  /** The saved draft this form was opened from, saved over; none saves a new one. */
  id?: string;
  title: string;
  body: JsonValue;
}

/** Saves a form's draft, over the one it was opened from if there is one. Nothing is logged: a draft is not a record. */
export function saveDraft(s: TerminalState, d: DraftToSave, ctx: Ctx): Change<SavedDraft> {
  const key = d.private ? DRAFT_LISTS.private : DRAFT_LISTS.shared;
  const list = listOf(s, key);
  const author = ctx.who?.uid ?? 'here';
  const original = d.id ? list.find((x) => x.id === d.id) : undefined;

  if (d.id && !original) throw new KeystoneError('That draft is no longer saved: someone finished or deleted it. Save this as a new draft.');
  // The next number among this author's drafts on this form, so two computers never make the same id.
  const prefix = `${author}-${d.module}-`;
  const next = 1 + Math.max(0, ...list.filter((x) => x.id.startsWith(prefix)).map((x) => Number(x.id.slice(prefix.length)) || 0));

  const draft: SavedDraft = {
    id: original?.id ?? `${prefix}${next}`, module: d.module, title: d.title.trim() || 'Untitled draft', saved: stamp(ctx.now()),
    by: ctx.who?.name ?? '', body: d.body,
  };

  if (d.private && (original?.uid ?? ctx.who?.uid)) draft.uid = original?.uid ?? ctx.who?.uid;
  const items = original ? list.map((x) => (x.id === original.id ? draft : x)) : [...list, draft];

  return { state: withList(s, key, items), record: draft, message: original ? 'Draft saved again.' : 'Draft saved. Open it again from Drafts.' };
}

/** Takes a saved draft away: deleted, or finished and saved for real. Gone already is no change. */
export function removeDraft(s: TerminalState, id: string, ctx: Pick<Ctx, 'who'>, finished = false): Change<SavedDraft | null> {
  for (const key of [DRAFT_LISTS.shared, DRAFT_LISTS.private]) {
    const list = listOf(s, key);
    const draft = list.find((d) => d.id === id);

    if (!draft) continue;

    if (draft.uid && ctx.who && draft.uid !== ctx.who.uid) throw new KeystoneError('Only whoever saved this draft can delete it.');

    return { state: withList(s, key, list.filter((d) => d.id !== id)), record: draft, message: finished ? 'Draft finished.' : `Draft “${draft.title}” deleted.` };
  }

  return { state: s, record: null, message: 'That draft is already gone.' };
}

/** How the drafts list says when and by whom a draft was saved: "Saved Nov 24, 2026, 19:05 by Jean Ashley Chico". */
export function draftSavedLine(d: Pick<SavedDraft, 'saved' | 'by'>): string {
  const when = d.saved ? `${shortDate(d.saved.slice(0, 10))}, ${d.saved.slice(11)}` : '';

  return ['Saved', when, d.by && `by ${d.by}`].filter(Boolean).join(' ');
}
