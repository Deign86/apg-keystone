import { describe, expect, it } from 'vitest';
import { DRAFT_DOCUMENTS } from '@keystone/core';
import { buildRegistry, documentLayout, findService, memberGrants, type ModuleDef } from '../src/registry';
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
const mod = (id: string, extra: Partial<ModuleDef> = {}): ModuleDef => ({ id, title: id[0].toUpperCase() + id.slice(1), blurb: '', order: 0, Screen, ...extra });

describe('registry', () => {
  it('orders modules and keeps the connectors as listed', () => {
    const r = buildRegistry([mod('billing', { order: 3 }), mod('home', { order: 0 }), mod('payroll', { order: 1 })], [okConnector('payroll'), okConnector('lease')]);

    expect(r.modules.map((m) => m.id)).toEqual(['home', 'payroll', 'billing']);
    expect(r.connectors.map((c) => c.id)).toEqual(['payroll', 'lease']);
    expect(r.refused).toEqual([]);
  });

  it('refuses a broken connector or a second module of one id, and keeps the rest', () => {
    const r = buildRegistry([mod('home'), mod('home', { title: 'Duplicate', order: 9 })], [
      okConnector('payroll'),
      okConnector('payroll'),
      okConnector('Bad Id'),
      okConnector('ghost', { logo: '' }),
      okConnector('lease'),
    ]);

    expect(r.connectors.map((c) => c.id)).toEqual(['payroll', 'lease']);
    expect(r.modules.map((m) => m.title)).toEqual(['Home']);
    expect(r.refused.map((x) => x.id)).toEqual(['payroll', 'Bad Id', 'ghost', 'home']);
  });

  it('refuses a second connector that keeps the same field on a member, and one whose field cannot be kept', () => {
    const grant = (field: string) => ({ memberGrant: { field, label: 'Site admin', as: 'a site admin', opens: 'the site\'s admin screens', asks: { give: () => 'Give?', take: () => 'Take?' } } });
    const r = buildRegistry([], [okConnector('site', grant('siteAdmin')), okConnector('copy', grant('siteAdmin')), okConnector('rogue', grant('role')), okConnector('odd', grant('site admin'))]);

    expect(r.connectors.map((c) => c.id)).toEqual(['site']);
    expect(r.refused).toEqual([
      { id: 'copy', reason: 'copy keeps "siteAdmin" on a member, which site already does.' },
      { id: 'rogue', reason: 'Connector "rogue" offers something for members that cannot be kept: the field "role" is the member\'s own.' },
      { id: 'odd', reason: 'Connector "odd" offers something for members that cannot be kept: the field "site admin" must be letters, starting lowercase.' },
    ]);
    // What the accounts screen offers and the cloud platform may write: the installed connectors' grants, and no other.
    expect(memberGrants(r.connectors).map((g) => g.field)).toEqual(['siteAdmin']);
    expect(memberGrants([okConnector('plain')])).toEqual([]);
  });

  it('refuses a module id that cannot be a route', () => {
    const r = buildRegistry([mod('Check Vouchers')], []);
    expect(r.modules).toEqual([]);
    expect(r.refused[0].reason).toMatch(/lowercase letters, digits and dashes/);
  });

  it('keeps each module\'s own records in a collection nobody else uses, and lays them out for the cloud', () => {
    const own = (collection: string) => ({ collection, list: 'requests', key: 'no', fields: ['status'] });

    const r = buildRegistry([
      mod('funds', { order: 1, documents: own('rf') }),
      mod('copycat', { order: 2, documents: own('rf') }),
      mod('vouchers', { order: 3, documents: own('cv') }),
      mod('shouty', { order: 4, documents: own('Big-List') }),
      mod('roster', { order: 5, documents: own('members') }),
      mod('scribble', { order: 6, documents: own('mydrafts') }),
    ], []);

    expect(r.modules.map((m) => m.id)).toEqual(['funds']);
    expect(r.refused).toEqual([
      { id: 'copycat', reason: 'Copycat keeps its records in "rf", which Funds already uses.' },
      { id: 'vouchers', reason: 'Vouchers keeps its records in "cv", which Keystone already uses.' },
      { id: 'shouty', reason: 'Shouty keeps its records in "Big-List", which must be lowercase letters.' },
      { id: 'roster', reason: 'Roster keeps its records in "members", which Keystone already uses.' },
      { id: 'scribble', reason: 'Scribble keeps its records in "mydrafts", which Keystone already uses.' },
    ]);
    // The kernel's saved drafts are always laid out (docs/adr/0041), with or without a module that keeps records.
    expect(documentLayout(r.modules)).toEqual({ ...DRAFT_DOCUMENTS, funds: own('rf') });
    expect(documentLayout([mod('home')])).toEqual(DRAFT_DOCUMENTS);
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
    const r = buildRegistry([mod('Ledger Book', { provides: { 'ledger.totals': ledger } })], []);
    expect(r.modules).toEqual([]);
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
