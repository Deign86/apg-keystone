import { FeedbackProvider } from '@keystone/ui';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { comingSoon } from '../src/ComingSoon';
import { KeystoneProvider } from '../src/context';
import { buildRegistry, type ModuleDef } from '../src/registry';
import { Shell } from '../src/Shell';
import { KeystoneStore } from '../src/store';
import { memoryPlatform } from './fakes';

declare module '@keystone/core' {
  interface ServiceContracts {
    'ledger.totals': { total(): number };
  }
}

const ledger: ModuleDef = {
  id: 'ledger',
  title: 'Ledger',
  section: 'Books',
  blurb: 'Every peso in and out.',
  order: 1,
  Screen: () => <h1>The real ledger</h1>,
  requires: ['home'],
  onHome: true,
  stat: () => ['Entries', '3'],
  figure: () => ({ label: 'Ledger', value: '3', caption: '' }),
  finding: () => ({ text: 'The ledger is behind.', priority: 2 }),
  waiting: () => [],
  openWaiting: () => {},
  create: { label: 'New entry', run: () => {} },
  logTags: { LG: 'Ledger' },
  onOpen: (state) => state,
  provides: { 'ledger.totals': { total: () => 3 } },
  documents: { list: 'entries', collection: 'ledger', key: 'no', fields: [] },
};

const home: ModuleDef = { id: 'home', title: 'Home', section: '', blurb: '', order: 0, Screen: () => <h1>Home</h1> };

afterEach(() => {
  window.location.hash = '';
});

describe('a screen coming soon', () => {
  it('keeps what it does for other parts and contributes nothing it shows', () => {
    const soon = comingSoon(ledger);

    expect(soon).toMatchObject({ id: 'ledger', title: 'Ledger', section: 'Books', blurb: 'Every peso in and out.', order: 1, soon: true });
    expect(soon.requires).toBe(ledger.requires);
    expect(soon.onOpen).toBe(ledger.onOpen);
    expect(soon.provides).toBe(ledger.provides);
    expect(soon.documents).toBe(ledger.documents);

    for (const shown of ['onHome', 'stat', 'figure', 'finding', 'waiting', 'openWaiting', 'create', 'logTags'] as const) {
      expect(soon[shown]).toBeUndefined();
    }
  });

  it('is marked in the rail and says so on its screen', async () => {
    const store = await KeystoneStore.open(memoryPlatform().platform);
    window.location.hash = '#ledger';

    render(
      <FeedbackProvider>
        <KeystoneProvider store={store} registry={buildRegistry([home, comingSoon(ledger)], [])}>
          <Shell />
        </KeystoneProvider>
      </FeedbackProvider>,
    );

    const rail = within(screen.getByRole('navigation', { name: 'Keystone' }));
    expect(rail.getByRole('button', { name: 'Ledger, coming soon' })).toHaveAttribute('aria-current', 'page');
    expect(rail.getByRole('button', { name: /^Home/ })).not.toHaveTextContent('Soon');

    expect(screen.getByRole('heading', { name: 'Ledger', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Coming soon', level: 2 })).toBeInTheDocument();
    expect(screen.queryByText('The real ledger')).toBeNull();
  });
});
