import { describe, expect, it } from 'vitest';
import { CLOUD_LAYOUT, removeDirectoryRecord, SERVICES, topFinding, usedBy, type Ctx, type TerminalState } from '@keystone/core';
import { buildRegistry } from '@keystone/kit';
import { connectors } from '../connectors';
import { builtInModules } from '../modules';
import { sampleState } from '@keystone/core/sample';

// What every shipped part promises the kernel, checked over the real parts on the
// sample data. A new module or connector is covered here the moment it is installed.

const ctx: Ctx = { now: () => new Date(2026, 9, 30, 9, 5) };
const state = () => sampleState();
const registry = buildRegistry(builtInModules, connectors);
const published = new Set<string>(Object.values(SERVICES));

describe.each(registry.modules.map((m) => [m.id, m] as const))('the %s module', (_id, m) => {
  it('contributes well-formed figures, findings and waiting items', () => {
    const s = state();

    if (m.stat) expect(m.stat(s, ctx, registry.modules)).toEqual([expect.any(String), expect.any(String)]);

    if (m.figure) expect(m.figure(s, ctx)).toEqual(expect.objectContaining({ label: expect.any(String), value: expect.any(String), caption: expect.any(String) }));

    if (m.finding) {
      const f = m.finding(s, ctx);

      if (f) expect(f).toEqual({ priority: expect.any(Number), text: expect.stringMatching(/\.$/) });
    }

    for (const w of m.waiting?.(s, ctx) ?? []) expect(w.no).toEqual(expect.any(String));
  });

  it('keeps records of its own only in a collection firestore.rules names, with the fields the rules check', () => {
    if (!m.documents) return;
    const own = new Map(Object.entries(CLOUD_LAYOUT.own)).get(m.documents.collection);

    expect(own, `${m.documents.collection} is not declared in core's cloud-layout.json`).toBeDefined();
    expect(m.documents.fields).toEqual(own?.fields);
  });

  it('leaves the state it is given alone', () => {
    const s = state();
    const before = JSON.stringify(s);
    m.stat?.(s, ctx, registry.modules); m.figure?.(s, ctx); m.finding?.(s, ctx); m.waiting?.(s, ctx);

    if (m.refersTo) Array.from(m.refersTo.codes(s));

    if (m.onOpen) m.onOpen(s, ctx);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('names only services that exist', () => {
    for (const name of Object.keys(m.provides ?? {})) expect(published).toContain(name);

    for (const tag of Object.keys(m.logTags ?? {})) expect(tag).toMatch(/^[A-Z]{2,4}$/);
  });

  it('marks the directory records it refers to with a log tag of its own', () => {
    if (m.refersTo) expect(Object.keys(m.logTags ?? {})).toContain(m.refersTo.tag);
  });
});

describe('across the installed modules', () => {
  it('no two modules claim the same log tag', () => {
    const tags = registry.modules.flatMap((m) => Object.keys(m.logTags ?? {}));
    expect(tags).toEqual([...new Set(tags)]);
  });

  // Written out as a file saved by an earlier build holds it, never through the modules' own rules: the keys under
  // `ext` (funds, payroll, timekeeping) are what every Keystone so far wrote, and a module renaming its id must not
  // lose sight of them.
  const saved = (): TerminalState => ({
    ...state(),
    ext: {
      ...state().ext,
      funds: { requests: [{ no: 'RF-2026-0001', date: '2026-10-30', purpose: 'Venue deposit', lines: [], amount: 100, pay: 'check', payee: 'V-002', settle: 'ASAP', requester: 'Ana Cruz', status: 'For Approval' }], last: 'RF-2026-0001' },
      payroll: {
        setups: [{ emp: 'E-002', empNo: 'APGCO-0002', daily: 800 }],
        runs: [{ from: '2026-10-01', to: '2026-10-15', closed: '2026-10-16 09:00', rows: [{ setup: { emp: 'E-003', empNo: 'APGCO-0003', daily: 800 }, name: 'As paid', position: '', dept: '', tin: '' }] }],
      },
      timekeeping: { days: [{ emp: 'E-004', date: '2026-10-29', in: '08:00', out: '17:00', ot: 0, note: '' }], holidays: [] },
    },
  });

  const referencesOf = (without: string[] = []) => registry.modules.filter((m) => !without.includes(m.id)).flatMap((m) => m.refersTo ?? []);

  it('a directory record that a voucher or statement names is kept, as it always was', () => {
    const s = state();
    const used = Object.fromEntries(s.dir.map((d) => [d.code, usedBy(s, d.code, referencesOf())]));

    // What core's own list answered before the modules said it themselves. Its third entry, a saved ID, said so
    // through the ID Maker, which is no longer installed (docs/adr/0046): the IDs stay in the records, but none of
    // them keeps its employee now.
    const before = Object.fromEntries(s.dir.map((d) => [d.code, [
      ...(s.cv.some((v) => v.payee === d.code) ? ['CV'] : []), ...(s.bs.some((b) => b.client === d.code) ? ['BS'] : []),
    ]]));

    expect(used).toEqual(before);
    expect(used['V-001']).toEqual(['CV']);
    expect(used['V-002']).toEqual([]);
    expect(s.ids.length).toBeGreaterThan(0);
    expect(Object.values(used).flat()).not.toContain('ID');
    expect(() => removeDirectoryRecord(s, 'V-001', ctx, referencesOf())).toThrow('V-001 is used by CV records and cannot be removed.');
  });

  it('a directory record that a request for funds, a pay setup, a closed cut-off or a recorded day names is now kept too', () => {
    const s = saved();
    const own = (code: string) => usedBy(s, code, referencesOf()).filter((t) => ['RF', 'PAY', 'DTR'].includes(t));

    expect(own('V-002')).toEqual(['RF']);
    expect(own('E-002')).toEqual(['PAY']);
    expect(own('E-003')).toEqual(['PAY']);
    expect(own('E-004')).toEqual(['DTR']);
    expect(own('V-003')).toEqual([]);
    expect(() => removeDirectoryRecord(s, 'V-002', ctx, referencesOf())).toThrow('V-002 is used by RF records and cannot be removed.');
    expect(() => removeDirectoryRecord(s, 'E-004', ctx, referencesOf())).toThrow(/used by .*DTR records and cannot be removed\./);

    // Only an installed part can say so: without Requests for Funds, nothing names V-002.
    expect(removeDirectoryRecord(s, 'V-002', ctx, referencesOf(['funds'])).message).toBe('V-002 removed.');
  });

  it('the Directory is told where a new record can be picked, in the words it has always used', () => {
    const where = (type: 'Vendor' | 'Client' | 'Employee') => registry.modules.flatMap((m) => m.selects?.[type] ?? []);

    // "V-005 added. It is now selectable in Requests for Funds." and its sibling (e2e/modules/directory.e2e.ts).
    expect(where('Vendor')).toEqual(['Requests for Funds']);
    expect(where('Client')).toEqual(['Billing Statements']);
    // The ID Maker was the one screen an employee was picked on, and it is no longer installed (docs/adr/0046), so a
    // new employee is "E-005 added." and nothing more.
    expect(where('Employee')).toEqual([]);
  });

  it('every published service has a provider: a module, or for the accounts the platform of a build that signs in', () => {
    const platforms: string[] = [SERVICES.accounts];

    for (const name of published) expect(registry.modules.some((m) => m.provides && name in m.provides) || platforms.includes(name), name).toBe(true);

    // And no module offers what is the platform's.
    for (const name of platforms) expect(registry.modules.some((m) => m.provides && name in m.provides), name).toBe(false);
  });

  it('the finding is the most urgent thing any installed module reports', () => {
    const finding = (ids?: string[]) => topFinding(registry.modules.filter((m) => !ids || ids.includes(m.id)).map((m) => m.finding?.(state(), ctx) ?? null));
    expect(finding()).toBe('₱91,000.00 from Dela Cruz, Maria Teresa has been overdue since Oct 10, 2026.');
    // Without billing installed, the vouchers finding leads.
    expect(finding(registry.modules.map((m) => m.id).filter((id) => id !== 'billing'))).toBe('1 voucher worth ₱35,000.00 waits for approval.');
    expect(finding([])).toBe('Nothing is waiting on you.');
  });

  it('Overview\'s Home figure counts what the installed modules say waits on you, and follows them', () => {
    const overview = registry.modules.find((m) => m.id === 'overview');
    const waiting = (mods: typeof registry.modules) => mods.reduce((n, m) => n + (m.waiting?.(state(), ctx).length ?? 0), 0);
    const withoutBilling = registry.modules.filter((m) => m.id !== 'billing');

    // Billing's sent and overdue statements are among them, so removing it lowers the count.
    expect(waiting(withoutBilling)).toBeLessThan(waiting(registry.modules));
    expect(overview?.stat?.(state(), ctx, registry.modules)).toEqual(['Waiting on you', String(waiting(registry.modules))]);
    expect(overview?.stat?.(state(), ctx, withoutBilling)).toEqual(['Waiting on you', String(waiting(withoutBilling))]);
    expect(overview?.stat?.(state(), ctx, [])).toEqual(['Waiting on you', '0']);
  });
});
