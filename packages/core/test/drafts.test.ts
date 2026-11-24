import { describe, expect, it } from 'vitest';
import {
  DRAFT_DOCUMENTS, DRAFT_LISTS, draftSavedLine, emptyState, fromDocuments, linesBlank, linesFromDraft, moduleData, nextDraftId, removeDraft, saveDraft, savedDrafts,
  toDocuments, withModuleData, type Ctx, type Member,
} from '../src';

// Saved drafts (docs/adr/0041): kept by the kernel for every module, shared or kept to their author, and never records.

const at = (h: number, m = 0) => new Date(2026, 10, 24, h, m);
const ana: Member = { uid: 'ana-1', name: 'Ana Cruz', role: 'staff' };
const ben: Member = { uid: 'ben-2', name: 'Ben Reyes', role: 'staff' };
const ceo: Member = { uid: 'ceo-0', name: 'Mark Anthony Santos', role: 'owner' };
const as = (who?: Member, h = 9): Ctx => ({ now: () => at(h), ...(who && { who }) });

describe('saved drafts', () => {
  it('keeps a form\'s draft with the records, writes nothing in the log, and lists it for its module only', () => {
    const r = saveDraft(emptyState(), { module: 'billing', title: 'Novatek · ₱22,000.00', body: { client: 'Novatek' } }, as(ana));

    expect(r.message).toBe('Draft saved. Open it again from Drafts.');
    expect(r.record).toEqual({ id: 'ana-1-billing-1', module: 'billing', title: 'Novatek · ₱22,000.00', saved: '2026-11-24 09:00', by: 'Ana Cruz', body: { client: 'Novatek' } });
    expect(moduleData(r.state, DRAFT_LISTS.shared)).toEqual({ items: [r.record] });
    expect(r.state.log).toEqual([]);
    expect(savedDrafts(r.state, 'billing', as(ben))).toEqual([r.record]);
    expect(savedDrafts(r.state, 'vouchers', as(ben))).toEqual([]);
  });

  it('saves over the draft a form was opened from, and numbers a new one past its author\'s others', () => {
    const first = saveDraft(emptyState(), { module: 'billing', title: 'One', body: 1 }, as(ana, 9));
    const again = saveDraft(first.state, { module: 'billing', id: first.record.id, title: '  ', body: 2 }, as(ben, 10));

    expect(again.message).toBe('Draft saved. Open it again from Drafts.');
    expect(savedDrafts(again.state, 'billing', as(ana))).toEqual([{ ...first.record, title: 'Untitled draft', saved: '2026-11-24 10:00', by: 'Ben Reyes', body: 2 }]);
    const second = saveDraft(again.state, { module: 'billing', title: 'Two', body: 3 }, as(ana, 11));

    expect(second.record.id).toBe('ana-1-billing-2');
    // Newest first.
    expect(savedDrafts(second.state, 'billing', as(ana)).map((d) => d.title)).toEqual(['Two', 'Untitled draft']);
    // Two computers never make the same id: each counts only its own author's.
    expect(saveDraft(second.state, { module: 'billing', title: 'Ben', body: 4 }, as(ben)).record.id).toBe('ben-2-billing-1');
    expect(saveDraft(emptyState(), { module: 'billing', title: 'Here', body: 5 }, as()).record).toMatchObject({ id: 'here-billing-1', by: '' });
  });

  it('saves under the id a form was given before it was ever saved, or again under one someone deleted meanwhile', () => {
    const given = nextDraftId(emptyState(), 'billing', as(ana));

    expect(given).toBe('ana-1-billing-1');
    const first = saveDraft(emptyState(), { module: 'billing', id: given, title: 'One', body: 1 }, as(ana));

    expect(first.record.id).toBe(given);
    expect(first.message).toBe('Draft saved. Open it again from Drafts.');
    expect(nextDraftId(first.state, 'billing', as(ana))).toBe('ana-1-billing-2');
    expect(nextDraftId(first.state, 'billing', as(ben))).toBe('ben-2-billing-1');
    expect(nextDraftId(first.state, 'funds', as())).toBe('here-funds-1');
    // Deleted by someone while it was open: saved again, under its own id, so nothing typed is lost.
    expect(saveDraft(emptyState(), { module: 'billing', id: 'ana-1-billing-9', title: 'Back', body: 2 }, as(ana)).record.id).toBe('ana-1-billing-9');
  });

  it('keeps a private draft to its author: an owner is sent everyone\'s, and sees only their own', () => {
    const mine = saveDraft(emptyState(), { module: 'funds', private: true, title: 'Pantry', body: {} }, as(ana));
    const theirs = saveDraft(mine.state, { module: 'funds', private: true, title: 'Taxi', body: {} }, as(ben));

    expect(mine.record.uid).toBe('ana-1');
    expect(moduleData(theirs.state, DRAFT_LISTS.private)).toEqual({ items: [mine.record, theirs.record] });
    expect(moduleData(theirs.state, DRAFT_LISTS.shared)).toBeUndefined();
    expect(savedDrafts(theirs.state, 'funds', as(ana)).map((d) => d.title)).toEqual(['Pantry']);
    expect(savedDrafts(theirs.state, 'funds', as(ceo))).toEqual([]);
    // On a computer with nobody signed in, every draft on it is theirs.
    expect(savedDrafts(theirs.state, 'funds', as()).map((d) => d.title).sort()).toEqual(['Pantry', 'Taxi']);
    // Saving over it keeps it its author's, whoever saves it.
    expect(saveDraft(theirs.state, { module: 'funds', private: true, id: mine.record.id, title: 'Pantry, more', body: {} }, as(ana)).record.uid).toBe('ana-1');
  });

  it('deletes a draft, or takes one away once it is finished; a private one only its author deletes', () => {
    const shared = saveDraft(emptyState(), { module: 'soa', title: 'Northwind', body: {} }, as(ana));
    const both = saveDraft(shared.state, { module: 'funds', private: true, title: 'Pantry', body: {} }, as(ana));

    expect(removeDraft(both.state, shared.record.id, as(ben)).message).toBe('Draft “Northwind” deleted.');
    expect(removeDraft(both.state, both.record.id, as(ana), true).message).toBe('Draft finished.');
    expect(savedDrafts(removeDraft(both.state, both.record.id, as(ana)).state, 'funds', as(ana))).toEqual([]);
    expect(() => removeDraft(both.state, both.record.id, as(ben))).toThrow('Only whoever saved this draft can delete it.');
    const gone = removeDraft(both.state, 'nothing', as(ana));

    expect(gone).toMatchObject({ record: null, message: 'That draft is already gone.' });
    expect(gone.state).toBe(both.state);
  });

  it('reads back saved data field by field, leaving out a draft damaged past use', () => {
    const s = withModuleData(emptyState(), DRAFT_LISTS.shared, {
      items: [{ id: 'a-billing-1', module: 'billing', title: 7, body: {} }, { id: 'b-billing-1', module: 'billing' }, { module: 'billing', body: {} }, 'junk'],
    });

    expect(savedDrafts(s, 'billing', as())).toEqual([{ id: 'a-billing-1', module: 'billing', title: '', saved: '', by: '', body: {} }]);
  });

  it('are a document each in the cloud, private ones with their author beside the body for the rules', () => {
    const one = saveDraft(emptyState(), { module: 'vouchers', title: 'Meralco', body: { payee: 'MERALCO' } }, as(ana));
    const two = saveDraft(one.state, { module: 'funds', private: true, title: 'Pantry', body: { purpose: 'Pantry' } }, as(ana));
    const docs = toDocuments(two.state, DRAFT_DOCUMENTS);

    expect(docs.filter((d) => d.collection === 'drafts')).toEqual([{ collection: 'drafts', id: 'ana-1-vouchers-1', pos: 0, body: JSON.stringify(one.record), fields: {} }]);
    expect(docs.filter((d) => d.collection === 'mydrafts')).toEqual([{ collection: 'mydrafts', id: 'ana-1-funds-1', pos: 0, body: JSON.stringify(two.record), fields: { uid: 'ana-1' } }]);
    expect(fromDocuments(docs, DRAFT_DOCUMENTS)).toEqual(two.state);
  });

  it('say when and by whom they were saved', () => {
    expect(draftSavedLine({ saved: '2026-11-24 19:05', by: 'Jean Ashley Chico' })).toBe('Saved Nov 24, 2026, 19:05 by Jean Ashley Chico');
    expect(draftSavedLine({ saved: '2026-11-24 19:05', by: '' })).toBe('Saved Nov 24, 2026, 19:05');
  });
});

describe('lines from a saved draft', () => {
  it('keep what was typed with new ids, and start one blank line when none were saved', () => {
    const lines = linesFromDraft([{ id: 'line-1', desc: 'Rent', qty: '2', amount: '100' }, { id: 'line-1', desc: 'Dues' }]);

    expect(lines.map(({ id: _, ...l }) => l)).toEqual([{ desc: 'Rent', qty: '2', amount: '100' }, { desc: 'Dues', qty: '1', amount: '' }]);
    expect(new Set(lines.map((l) => l.id)).size).toBe(2);
    expect(linesFromDraft(undefined)).toHaveLength(1);
    expect(linesFromDraft([])).toHaveLength(1);
  });

  it('are blank with nothing typed on any of them; a quantity alone is not something typed', () => {
    expect(linesBlank(linesFromDraft(undefined))).toBe(true);
    expect(linesBlank(linesFromDraft([{ desc: '  ', qty: '3' }]))).toBe(true);
    expect(linesBlank(linesFromDraft([{}, { amount: '12' }]))).toBe(false);
    expect(linesBlank(linesFromDraft([{ desc: 'Rent' }]))).toBe(false);
  });
});
