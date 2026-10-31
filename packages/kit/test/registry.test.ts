import { describe, expect, it } from 'vitest';
import { buildRegistry, findService, type ModuleDef } from '../src/registry';
import { okConnector } from './fakes';

// Made-up services for these tests, published the way a real one is.
declare module '@keystone/core' {
  interface ServiceContracts {
    'ledger.totals': { total(): number };
    'bank.balance': { balance(): number };
    'payroll.runs': { runs(): number };
  }
}

const Screen = () => null;
const mod = (id: string, extra: Partial<ModuleDef> = {}): ModuleDef => ({ id, title: id[0].toUpperCase() + id.slice(1), section: '', blurb: '', order: 0, Screen, ...extra });

describe('registry', () => {
  it('orders modules and takes the ones connectors bring', () => {
    const r = buildRegistry([mod('home', { order: 0 }), mod('billing', { order: 3 })], [
      { connector: okConnector('payroll'), modules: [mod('payroll', { order: 1 })] },
    ]);

    expect(r.modules.map((m) => m.id)).toEqual(['home', 'payroll', 'billing']);
    expect(r.connectors.map((c) => c.id)).toEqual(['payroll']);
    expect(r.refused).toEqual([]);
  });

  it('refuses a broken plugin and keeps the rest', () => {
    const r = buildRegistry([mod('home')], [
      { connector: okConnector('payroll'), modules: [mod('payroll', { order: 8 })] },
      { connector: okConnector('payroll') },
      { connector: okConnector('Bad Id') },
      { connector: okConnector('lease'), modules: [mod('home', { title: 'Duplicate', order: 9 })] },
    ]);

    expect(r.connectors.map((c) => c.id)).toEqual(['payroll', 'lease']);
    expect(r.modules.map((m) => m.id)).toEqual(['home', 'payroll']);
    expect(r.refused.map((x) => x.id)).toEqual(['payroll', 'Bad Id', 'home']);
  });

  it('a refused connector takes its screens with it', () => {
    // SAFETY: a deliberately broken connector with no health check; the registry must refuse it.
    const r = buildRegistry([], [{ connector: { ...okConnector('lease'), health: undefined as never }, modules: [mod('lease')] }]);
    expect(r.modules).toEqual([]);
    expect(r.refused.map((x) => x.id)).toEqual(['lease']);
  });

  it('refuses a module id that cannot be a route', () => {
    const r = buildRegistry([mod('Check Vouchers')], []);
    expect(r.modules).toEqual([]);
    expect(r.refused[0].reason).toMatch(/lowercase letters, digits and dashes/);
  });

  it('leaves out a module whose requirement is missing, and anything that needed it', () => {
    const r = buildRegistry([mod('home'), mod('reports', { requires: ['ledger'] }), mod('audit', { requires: ['reports'] })], []);
    expect(r.modules.map((m) => m.id)).toEqual(['home']);
    expect(r.refused).toEqual([
      { id: 'reports', reason: 'Reports needs ledger, which is not installed.' },
      { id: 'audit', reason: 'Audit needs reports, which is not installed.' },
    ]);
  });
});

describe('services', () => {
  const ledger = { total: () => 42 };

  it('finds the installed provider of a service by name', () => {
    const r = buildRegistry([mod('ledger', { provides: { 'ledger.totals': ledger } }), mod('reports')], []);
    expect(findService(r.modules, 'ledger.totals')?.total()).toBe(42);
  });

  it('tells services apart by name when several are installed', () => {
    const bank = { balance: () => 7 };
    const r = buildRegistry([mod('ledger', { order: 1, provides: { 'ledger.totals': ledger } }), mod('bank', { order: 2, provides: { 'bank.balance': bank } })], []);
    expect(findService(r.modules, 'bank.balance')).toBe(bank);
    expect(findService(r.modules, 'ledger.totals')).toBe(ledger);
    expect(findService(r.modules, 'payroll.runs')).toBeUndefined();
  });

  it('gives nothing when the provider is not installed', () => {
    const r = buildRegistry([mod('reports')], []);
    expect(findService(r.modules, 'ledger.totals')).toBeUndefined();
  });

  it('does not offer the services of a module that was left out', () => {
    const r = buildRegistry([mod('ledger', { requires: ['bank'], provides: { 'ledger.totals': ledger } })], []);
    expect(findService(r.modules, 'ledger.totals')).toBeUndefined();
  });

  it('keeps one provider per service', () => {
    const r = buildRegistry([
      mod('ledger', { order: 1, provides: { 'ledger.totals': ledger } }),
      mod('shadow', { order: 2, provides: { 'ledger.totals': { total: () => 0 } } }),
    ], []);

    expect(r.modules.map((m) => m.id)).toEqual(['ledger']);
    expect(r.refused).toEqual([{ id: 'shadow', reason: 'Shadow offers ledger.totals, which Ledger already provides.' }]);
    expect(findService(r.modules, 'ledger.totals')?.total()).toBe(42);
  });
});
