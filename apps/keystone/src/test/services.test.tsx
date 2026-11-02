import { describe, expect, it } from 'vitest';
import { SERVICES } from '@keystone/core';
import { buildRegistry, findService, KeystoneStore } from '@keystone/kit';
import { plugins } from '../connectors';
import { builtInModules } from '../modules';
import { browserPlatform } from '../platform/browser';

// Billing publishes the statement-payments service (packages/core/src/kernel/services.ts) for any part that settles
// statements from outside billing. Checked here against the parts that ship, with and without billing installed.

describe('the statement-payments service, as shipped', () => {
  it('is provided by billing under its published name, and lists the statements still open', async () => {
    const desk = findService(buildRegistry(builtInModules, plugins).modules, SERVICES.statementPayments);
    const store = await KeystoneStore.open({ ...browserPlatform, loadState: async () => null, saveState: async () => {} });

    expect(desk).toBeDefined();
    expect(desk!.open(store.state).length).toBeGreaterThan(0);
  });

  it('is absent, not broken, without billing', () => {
    const r = buildRegistry(builtInModules.filter((m) => m.id !== 'billing'), plugins);

    expect(r.refused).toEqual([]);
    expect(findService(r.modules, SERVICES.statementPayments)).toBeUndefined();
  });
});
