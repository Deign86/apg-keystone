import { describe, expect, it } from 'vitest';
import { SERVICES, topFinding, type Ctx } from '@keystone/core';
import { buildRegistry } from '@keystone/kit';
import { plugins } from '../connectors';
import { builtInModules } from '../modules';
import { sampleState } from '@keystone/core/sample';

// What every shipped part promises the kernel, checked over the real parts on the
// sample data. A new module or connector is covered here the moment it is installed.

const ctx: Ctx = { now: () => new Date(2026, 9, 30, 9, 5) };
const state = () => sampleState();
const registry = buildRegistry(builtInModules, plugins);
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

  it('leaves the state it is given alone', () => {
    const s = state();
    const before = JSON.stringify(s);
    m.stat?.(s, ctx, registry.modules); m.figure?.(s, ctx); m.finding?.(s, ctx); m.waiting?.(s, ctx);

    if (m.onOpen) m.onOpen(s, ctx);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('names only parts and services that exist', () => {
    const ids = new Set(registry.modules.map((x) => x.id));

    for (const r of m.requires ?? []) expect(ids).toContain(r);

    for (const name of Object.keys(m.provides ?? {})) expect(published).toContain(name);

    for (const tag of Object.keys(m.logTags ?? {})) expect(tag).toMatch(/^[A-Z]{2,4}$/);
  });
});

describe('across the installed modules', () => {
  it('no two modules claim the same log tag', () => {
    const tags = registry.modules.flatMap((m) => Object.keys(m.logTags ?? {}));
    expect(tags).toEqual([...new Set(tags)]);
  });

  it('every published service has a provider', () => {
    for (const name of published) expect(registry.modules.some((m) => m.provides && name in m.provides)).toBe(true);
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
