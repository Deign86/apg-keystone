import { describe, expect, it } from 'vitest';
import { diffDocuments, documentId, fromDocuments, toDocuments, type DocumentLayout, type JsonObject, type TerminalState } from '../src';
import { sampleState } from '../sample';

// The saved state as one document per record (docs/adr/0009): it must read back exactly as it was saved, and a change
// must write only the documents it touched.

const state = (): TerminalState => sampleState();
const withEntry = (s: TerminalState, text: string): TerminalState => ({ ...s, log: [{ when: '2026-11-11 09:30', mod: 'CV', text }, ...s.log] });

describe('documents', () => {
  it('reads the sample data back exactly as it was saved', () => {
    const s = state();
    expect(fromDocuments(toDocuments(s))).toEqual(s);
  });

  it('keeps the company\'s details as one document of their own, and none until there are any (docs/adr/0018)', () => {
    const s = state();
    const details = toDocuments(s).filter((d) => d.collection === 'company');

    expect(details).toEqual([{ collection: 'company', id: 'details', pos: 0, body: JSON.stringify(s.company) }]);
    expect(toDocuments({ ...s, company: undefined }).filter((d) => d.collection === 'company')).toEqual([]);
    expect(fromDocuments(toDocuments({ ...s, company: undefined }))).not.toHaveProperty('company');
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

// A list a module keeps as documents of its own (docs/adr/0011): one document per record in its own collection, with
// the fields the rules check beside the body, and those fields winning when it is read back.
describe('a module\'s own records', () => {
  const layout: DocumentLayout = { funds: { collection: 'rf', list: 'requests', key: 'no', fields: ['status', 'uid', 'decision'], readBy: 'uid' } };
  const request = (no: string, extra: JsonObject = {}): JsonObject => ({ no, purpose: 'Christmas party', amount: 48000, status: 'For Approval', uid: 'hr-1', ...extra });
  const withRequests = (requests: JsonObject[]): TerminalState => ({ ...state(), ext: { payroll: { runs: [] }, funds: { requests, last: 'RF-2026-0002' } } });

  it('keeps each record in its own document, with its checked fields beside it, and the rest in the module\'s document', () => {
    const s = withRequests([request('RF-2026-0001'), request('RF-2026-0002', { status: 'Approved', decision: { by: 'Mark Reyes', uid: 'owner-1', at: '2026-11-02 10:00' } })]);
    const docs = toDocuments(s, layout);
    const rf = docs.filter((d) => d.collection === 'rf');

    expect(rf.map((d) => [d.id, d.pos, d.fields])).toEqual([
      ['RF-2026-0001', 0, { status: 'For Approval', uid: 'hr-1' }],
      ['RF-2026-0002', 1, { status: 'Approved', uid: 'hr-1', decision: { by: 'Mark Reyes', uid: 'owner-1', at: '2026-11-02 10:00' } }],
    ]);
    expect(JSON.parse(docs.find((d) => d.collection === 'ext' && d.id === 'funds')!.body)).toEqual({ module: 'funds', data: { last: 'RF-2026-0002' } });
    expect(fromDocuments(docs, layout)).toEqual(s);
    // Without the layout, the module's data is one document, as before.
    expect(toDocuments(s).some((d) => d.collection === 'rf')).toBe(false);
  });

  it('writes only the new record\'s document when a record is added', () => {
    const before = withRequests([request('RF-2026-0001')]);
    const after = withRequests([request('RF-2026-0001'), request('RF-2026-0002')]);
    const change = diffDocuments(toDocuments(before, layout), toDocuments(after, layout));

    expect(change.set.map((d) => `${d.collection}/${d.id}`)).toEqual(['rf/RF-2026-0002']);
    expect(change.remove).toEqual([]);
  });

  it('reads the checked fields over the body, so a body edited past the rules changes none of them', () => {
    const docs = toDocuments(withRequests([request('RF-2026-0001')]), layout).map((d) => (d.collection === 'rf'
      ? { ...d, body: JSON.stringify(request('RF-2026-0001', { status: 'Approved', uid: 'someone-else', decision: { by: 'Me' } })) }
      : d));

    expect(fromDocuments(docs, layout).ext?.funds).toEqual({ last: 'RF-2026-0002', requests: [request('RF-2026-0001')] });
  });

  it('reads the records back into the module\'s data even when its own document is missing, in their order', () => {
    const docs = toDocuments(withRequests([request('RF-2026-0001'), request('RF-2026-0002')]), layout).filter((d) => !(d.collection === 'ext' && d.id === 'funds'));
    expect(fromDocuments([...docs].reverse(), layout).ext!.funds).toEqual({ requests: [request('RF-2026-0001'), request('RF-2026-0002')] });
  });

  it('leaves module data that is not an object as it is', () => {
    const s = { ...state(), ext: { funds: ['not', 'an', 'object'] } };
    expect(fromDocuments(toDocuments(s, layout), layout)).toEqual(s);
  });
});
