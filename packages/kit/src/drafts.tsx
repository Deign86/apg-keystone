import { Button, Panel, SectionLabel, StatusPill, useConfirm } from '@keystone/ui';
import { useEffect, useRef } from 'react';
import { count, draftSavedLine, nextDraftId, removeDraft, saveDraft, savedDrafts, type Editing, type JsonValue, type SavedDraft } from '@keystone/core';
import { useKeystone, useRuntime } from './context';

// Save draft on a module's form (docs/adr/0041): the form's work kept with the records, listed under Drafts on its
// screen, opened again to be finished on any computer, or deleted. It saves itself as the person types and when they
// leave the form, the screen or Keystone; Save draft saves it at once. The kernel keeps every module's drafts; a module
// says what a draft is called, when its form holds nothing worth keeping, how a saved one goes back in the form, and
// whether only its author reads it.

/**
 * The longest an edit waits to be kept: the first edit not kept yet starts this clock, and typing on does not restart
 * it, so a draft is kept at least this often while someone types. A force close (taskkill /F, Force Quit, the desktop
 * window destroyed) warns the page of nothing, so this is all of the typing it can lose. Once a second also keeps a
 * draft's document within the cloud's sustained rate for one document.
 */
export const AUTOSAVE_MS = 1000;

export interface SavedDraftsOf<T> {
  /** The module the form belongs to. */
  module: string;
  /** What the Drafts list calls one, from the module's rules. */
  title: (draft: T) => string;
  /** Nothing typed worth keeping: a form like this saves no draft, and emptied, its draft goes. */
  blank: (draft: T) => boolean;
  /**
   * The form's draft from a saved one: a fresh draft with what was saved over it, so a field an older Keystone did not
   * save starts as a new form's would, and a number is the next free one, not the one free when it was saved.
   */
  restore: (saved: Partial<T>) => T;
  /** Read by its author only, and an owner: a request for funds, which only its requester and the CEO read. */
  private?: boolean;
}

export interface SavedDraftsApi<T> {
  /** The saved drafts this person may open, newest first. */
  list: SavedDraft[];
  /** The saved draft the form holds, if it is one: when it was last saved, for the Save draft button to say. */
  current?: SavedDraft;
  /** Keeps the form's draft now, over the saved one it was opened from, if any, and says so. */
  save: () => void;
  /** Puts a saved draft back in the form. */
  open: (draft: SavedDraft) => void;
  /** Deletes a saved draft; the form, if it holds it, keeps what it holds as a new, unsaved one. */
  remove: (draft: SavedDraft) => void;
  /** After the form `saved` was saved for real: the draft it came from is finished, and goes, saying nothing. */
  finish: (saved: T) => void;
}

/** Which form a draft is: the saved record it edits and the saved draft it is, if any. Typing keeps it; New changes it. */
const formOf = (d: Editing) => `${d.editing ?? ''}|${d.savedDraft ?? ''}`;

/** A draft's content: what is kept, as JSON, and as text, which tells one draft's content from another's. */
interface DraftBody { json: JsonValue; text: string }

/** The draft without the saved draft it is. */
function bodyOf<T extends Editing>(d: T): DraftBody {
  const { savedDraft: _, ...body } = d;
  const text = JSON.stringify(body);

  // SAFETY: a form's draft is plain data (text, numbers, true or false, and lists and objects of them), so it comes back
  // from JSON as it went in, a JsonValue.
  return { json: JSON.parse(text) as JsonValue, text };
}

/**
 * A form's saved drafts: `draft` and `setDraft` are the form's own (useDraft). Each form is given the id its draft saves
 * under (`savedDraft`) as soon as it shows, so typing keeps saving over the same draft, and a new form, a record opened
 * or a draft opened is another form with another id.
 *
 * It saves itself, quietly, and writes the records at once each time: an edit (typing, picking) is kept no more than
 * AUTOSAVE_MS after it, however long the typing goes on; leaving the form for another, leaving the screen, or hiding or
 * closing Keystone keeps what is waiting at once. A blank form saves nothing, and a form emptied takes its draft away.
 */
export function useSavedDrafts<T extends Editing>(draft: T, setDraft: (next: T) => void, of: SavedDraftsOf<T>): SavedDraftsApi<T> {
  const { state, ctx, run } = useKeystone();
  const { store } = useRuntime();
  // What the effects read when they run: the latest draft and options, not those of the render that scheduled them.
  const latest = useRef({ draft, setDraft, of });
  latest.current = { draft, setDraft, of };
  // The form as it was when it became this form, or was last kept: a change from it is an edit.
  const shown = useRef({ form: formOf(draft), text: bodyOf(draft).text });
  // An edit not kept yet, and its timer.
  const pending = useRef<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  /** Keeps `d` quietly under its id; emptied, its draft goes. */
  const keep = (d: T) => {
    const { of: o } = latest.current;
    const { json, text } = bodyOf(d);
    const id = d.savedDraft;

    if (o.blank(d)) {
      if (id) store.run((s, c) => removeDraft(s, id, c));
    } else if (!store.run((s, c) => saveDraft(s, { module: o.module, private: o.private, id, title: o.title(d), body: json }, c)).ok) return;

    // Kept: this content is what the form, if it still shows it, now counts edits from.
    if (formOf(latest.current.draft) === formOf(d) && shown.current.form === formOf(d)) shown.current.text = text;
  };

  /**
   * Keeps the edit waiting, if there is one, now, and writes it to disk or the cloud at once rather than after the
   * store's usual pause: a process killed straight after loses nothing kept.
   */
  const flush = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const d = pending.current;

    pending.current = null;

    if (!d) return;
    keep(d);
    void store.flush();
  };

  /** Nothing of this form waits to be kept any more: it was saved by hand, saved for real, or its draft deleted. */
  const drop = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    pending.current = null;
  };

  // Each render: an edit of the same form waits to be kept; another form keeps the one left first; a form with no id
  // is given one.
  useEffect(() => {
    const form = formOf(draft);
    const { text } = bodyOf(draft);

    if (form !== shown.current.form) {
      flush();
      shown.current = { form, text };
    } else if (text !== shown.current.text) {
      // The latest edit is what is kept; the clock started by the first one still runs.
      pending.current = draft;
      timer.current ??= setTimeout(flush, AUTOSAVE_MS);
    }

    if (!draft.savedDraft) setDraft({ ...draft, savedDraft: nextDraftId(store.state, of.module, store.ctx) });
  });

  // Leaving the screen, or Keystone hidden or closing: the edit waiting is kept, and written at once.
  useEffect(() => {
    const away = () => {
      if (!pending.current) return;
      flush();
      void store.flush();
    };

    const hidden = () => { if (document.visibilityState === 'hidden') away(); };

    addEventListener('pagehide', away);
    document.addEventListener('visibilitychange', hidden);

    return () => {
      removeEventListener('pagehide', away);
      document.removeEventListener('visibilitychange', hidden);
      away();
    };
    // Once for the form's life: flush and keep read the latest through refs.
  }, [store]);

  const list = savedDrafts(state, of.module, ctx);

  return {
    list,
    current: draft.savedDraft ? list.find((d) => d.id === draft.savedDraft) : undefined,
    save: () => {
      drop();
      const { json, text } = bodyOf(draft);

      if (run((s, c) => saveDraft(s, { module: of.module, private: of.private, id: draft.savedDraft, title: of.title(draft), body: json }, c)).ok) {
        shown.current = { form: formOf(draft), text };
      }
    },
    // SAFETY: a saved draft's body is what this module's own form saved, a T without `savedDraft`; `restore` fills
    // anything an older Keystone left out.
    open: (saved) => setDraft({ ...of.restore(saved.body as Partial<T>), savedDraft: saved.id }),
    remove: (saved) => {
      const holds = draft.savedDraft === saved.id;

      if (holds) drop();

      // The form keeps what it holds, as another form, with an id of its own, kept once it is edited again.
      if (run((s, c) => removeDraft(s, saved.id, c)).ok && holds) setDraft({ ...draft, savedDraft: undefined });
    },
    finish: (saved) => {
      drop();
      const id = saved.savedDraft;

      if (id) store.run((s, c) => removeDraft(s, id, c, true));
    },
  };
}

/** The form's Save draft button, after when the form was last saved as a draft, if it has been. */
export function SaveDraftButton({ drafts }: { drafts: Pick<SavedDraftsApi<unknown>, 'save' | 'current'> }) {
  return (
    <>
      {drafts.current && <span className="mr-auto text-xs text-ink-2 tabular-nums" aria-live="polite">Draft saved {drafts.current.saved.slice(11)}</span>}
      <Button onClick={drafts.save}>Save draft</Button>
    </>
  );
}

/**
 * The screen's saved drafts, above its register, each marked Draft: what it is, when and by whom it was saved, Open
 * and Delete…. Nothing shows while there are none.
 */
export function SavedDrafts({ drafts, onOpen, noun }: {
  drafts: Pick<SavedDraftsApi<unknown>, 'list' | 'open' | 'remove'>;
  /** After a draft is put back in the form: show the form. */
  onOpen?: (draft: SavedDraft) => void;
  /** What one is, for the count: "voucher". */
  noun: string;
}) {
  const confirm = useConfirm();

  if (!drafts.list.length) return null;

  return (
    <Panel className="mb-4" aria-labelledby="saved-drafts">
      <div className="mb-2 flex items-baseline justify-between">
        <SectionLabel id="saved-drafts">Drafts</SectionLabel>
        <span className="text-xs text-ink-2">{count(drafts.list.length, `${noun} draft`)}</span>
      </div>
      <ul aria-label="Drafts" className="m-0 list-none p-0">
        {drafts.list.map((d) => (
          <li key={d.id} aria-label={d.title} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line py-2.5">
            <StatusPill status="Draft" tone="neutral" />
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate font-semibold" title={d.title}>{d.title}</p>
              <p className="m-0 text-xs text-ink-2 tabular-nums">{draftSavedLine(d)}</p>
            </div>
            <Button size="sm" onClick={() => { drafts.open(d); onOpen?.(d); }}>Open</Button>
            <Button
              size="sm"
              onClick={() => confirm({
                title: `Delete the draft “${d.title}”?`,
                body: 'The draft is deleted for everyone who can see it. Nothing that was saved for real changes.',
                confirm: 'Delete draft',
                danger: true,
                onConfirm: () => drafts.remove(d),
              })}
            >
              Delete…
            </Button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
