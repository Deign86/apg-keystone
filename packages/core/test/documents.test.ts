import { describe, expect, it } from 'vitest';
import { bundledSeed, diffDocuments, documentId, fromDocuments, toDocuments, type TerminalState } from '../src';

// The saved state as one document per record (docs/adr/0009): it must read back exactly as it was saved, and a change
// must write only the documents it touched.

const state = (): TerminalState => structuredClone(bundledSeed.state);
const withEntry = (s: TerminalState, text: string): TerminalState => ({ ...s, log: [{ when: '2026-11-11 09:30', mod: 'CV', text }, ...s.log] });

describe('documents', () => {
  it('reads the sample data back exactly as it was saved', () => {
    const s = state();
    expect(fromDocuments(toDocuments(s))).toEqual(s);
  });

  it('keeps each list in its order, whatever order the documents come back in', () => {
    const s = { ...state(), ext: { payroll: { runs: [1, 2] }, timekeeping: { holidays: [] } } };
    const shuffled = [...toDocuments(s)].reverse();
    const back = fromDocuments(shuffled);
    expect(back).toEqual(s);
    expect(Object.keys(back.ext!)).toEqual(['payroll', 'timekeeping']);
  });

  it('gives each record its own document, keyed by its code or number', () => {
    const s = state();
    const docs = toDocuments(s);
    expect(docs.filter((d) => d.collection === 'cv').map((d) => d.id)).toEqual(s.cv.map((v) => documentId(v.no)));
    expect(docs.filter((d) => d.collection === 'dir')).toHaveLength(s.dir.length);
    expect(docs.filter((d) => d.collection === 'log')).toHaveLength(s.log.length);
  });

  it('writes only the new log entry when one is added, and moves no other', () => {
    const before = state();
    const after = withEntry(before, 'CV-2026-0150 saved.');
    const change = diffDocuments(toDocuments(before), toDocuments(after));
    expect(change.remove).toEqual([]);
    expect(change.set).toHaveLength(1);
    expect(change.set[0].collection).toBe('log');
    expect(JSON.parse(change.set[0].body).text).toBe('CV-2026-0150 saved.');
  });

  it('writes only the record that changed, and deletes one that was removed', () => {
    const before = state();
    const edited = { ...before, cv: before.cv.map((v, i) => (i === 1 ? { ...v, check: '000999' } : v)) };
    expect(diffDocuments(toDocuments(before), toDocuments(edited)).set.map((d) => `${d.collection}/${d.id}`)).toEqual([`cv/${documentId(before.cv[1].no)}`]);

    const removed = { ...before, ids: before.ids.slice(0, -1) };
    const change = diffDocuments(toDocuments(before), toDocuments(removed));
    expect(change.set).toEqual([]);
    expect(change.remove).toEqual([{ collection: 'ids', id: documentId(before.ids.at(-1)!.no) }]);
  });

  it('writes nothing when nothing changed', () => {
    expect(diffDocuments(toDocuments(state()), toDocuments(state()))).toEqual({ set: [], remove: [] });
  });

  it('keeps two identical log entries made in the same minute as two documents', () => {
    const s = withEntry(withEntry(state(), 'Backup restored.'), 'Backup restored.');
    const ids = toDocuments(s).filter((d) => d.collection === 'log').map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(fromDocuments(toDocuments(s))).toEqual(s);
  });

  it('keeps records that share a number or have none, instead of one overwriting the other', () => {
    const s = state();
    const twice = { ...s, cv: [...s.cv, { ...s.cv[0], payee: s.cv[1].payee }], dir: [...s.dir, { ...s.dir[0], code: '' }] };
    const docs = toDocuments(twice);
    const ids = docs.map((d) => `${d.collection}/${d.id}`);
    expect(new Set(ids).size).toBe(ids.length);
    expect(fromDocuments(docs)).toEqual(twice);
  });

  it('makes ids Firestore accepts from any key', () => {
    for (const key of ['.', '..', '__name__', 'CV/2026/1', 'a b', 'ñ']) {
      const id = documentId(key);
      expect(id).not.toMatch(/\//);
      expect(id).not.toMatch(/^\.\.?$/);
      expect(id).not.toMatch(/^__.*__$/);
      expect(decodeURIComponent(id)).toBe(key);
    }
  });

  it('leaves out a document edited by hand into something that is not a record', () => {
    const docs = toDocuments(state());
    const broken = docs.map((d, i) => (i === 0 ? { ...d, body: '{ not json' } : d));
    expect(fromDocuments(broken).dir).toEqual(state().dir.slice(1));
  });
});
