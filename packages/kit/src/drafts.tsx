import { Button, Panel, SectionLabel, StatusPill, useConfirm } from '@keystone/ui';
import { count, draftSavedLine, removeDraft, saveDraft, savedDrafts, type Editing, type JsonValue, type SavedDraft } from '@keystone/core';
import { useKeystone, useRuntime } from './context';

// Save draft on a module's form (docs/adr/0041): the form's work kept with the records, listed under Drafts on its
// screen, opened again to be finished on any computer, or deleted. The kernel keeps every module's drafts; a module
// says what a draft is called, how a saved one goes back in its form, and whether only its author reads it.

export interface SavedDraftsOf<T> {
  /** The module the form belongs to. */
  module: string;
  /** What the Drafts list calls one, from the module's rules. */
  title: (draft: T) => string;
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
  /** Keeps the form's draft, over the saved one it was opened from, if any. */
  save: () => void;
  /** Puts a saved draft back in the form. */
  open: (draft: SavedDraft) => void;
  /** Deletes a saved draft; the form, if it holds it, keeps what it holds as a new, unsaved one. */
  remove: (draft: SavedDraft) => void;
  /** After the form `saved` was saved for real: the draft it came from is finished, and goes, saying nothing. */
  finish: (saved: T) => void;
}

/**
 * A form's saved drafts: `draft` and `setDraft` are the form's own (useDraft). Saving a draft or opening one marks the
 * form with it (`savedDraft`), so the next save goes over it and starting a new form starts a new draft.
 */
export function useSavedDrafts<T extends Editing>(draft: T, setDraft: (next: T) => void, of: SavedDraftsOf<T>): SavedDraftsApi<T> {
  const { state, ctx, run } = useKeystone();
  const { store } = useRuntime();

  return {
    list: savedDrafts(state, of.module, ctx),
    save: () => {
      const { savedDraft: id, ...body } = draft;
      // SAFETY: a form's draft is plain data (text, numbers, true or false, and lists and objects of them), so it comes
      // back from JSON as it went in, a JsonValue.
      const json = JSON.parse(JSON.stringify(body)) as JsonValue;
      const r = run((s, c) => saveDraft(s, { module: of.module, private: of.private, id, title: of.title(draft), body: json }, c));

      if (r.ok) setDraft({ ...draft, savedDraft: r.record.id });
    },
    // SAFETY: a saved draft's body is what this module's own form saved, a T without `savedDraft`; `restore` fills
    // anything an older Keystone left out.
    open: (saved) => setDraft({ ...of.restore(saved.body as Partial<T>), savedDraft: saved.id }),
    remove: (saved) => {
      const r = run((s, c) => removeDraft(s, saved.id, c));

      if (r.ok && draft.savedDraft === saved.id) setDraft({ ...draft, savedDraft: undefined });
    },
    finish: (saved) => {
      const id = saved.savedDraft;

      if (id) store.run((s, c) => removeDraft(s, id, c, true));
    },
  };
}

/** The form's Save draft button. */
export function SaveDraftButton({ drafts }: { drafts: Pick<SavedDraftsApi<unknown>, 'save'> }) {
  return <Button onClick={drafts.save}>Save draft</Button>;
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
