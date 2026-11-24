import { FeedbackProvider } from '@keystone/ui';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { changedElsewhere, LIVE_PAUSED, logged, type Ctx, type Member, type TerminalState } from '@keystone/core';
import { sampleState } from '@keystone/core/sample';
import { FormCard } from '../src/components';
import { KeystoneProvider } from '../src/context';
import { buildRegistry, type ModuleDef } from '../src/registry';
import { Shell } from '../src/Shell';
import { KeystoneStore } from '../src/store';
import { memoryPlatform } from './fakes';

// What the person is shown of others' saves (docs/adr/0047): a quiet word of each change as it arrives, a mark on the
// screens it changed until they are opened, the rail saying when live updates have stopped, and a form saying when the
// record it holds was changed by someone else.

const ana: Member = { uid: 'hr-1', name: 'Ana Cruz', role: 'staff' };
const mark: Member = { uid: 'ceo-1', name: 'Mark Reyes', role: 'owner' };
const at = (who: Member): Ctx => ({ now: () => new Date(2026, 10, 2, 10, 0), who });

/** A voucher form holding CV-2026-0141, as Check Vouchers' form does while editing it. */
function VoucherForm() {
  return (
    <FormCard
      eyebrow="Voucher entry"
      title="Editing CV-2026-0141"
      holds={{ label: 'CV-2026-0141', find: (s) => s.cv.find((v) => v.no === 'CV-2026-0141') }}
      onSubmit={() => {}}
      actions={<button type="submit">Save</button>}
    >
      <p>The form</p>
    </FormCard>
  );
}

const home: ModuleDef = { id: 'home', title: 'Home', blurb: '', order: 0, Screen: () => <h1>Home</h1> };
const vouchers: ModuleDef = { id: 'vouchers', title: 'Check Vouchers', blurb: '', order: 1, logTags: { CV: 'Vouchers' }, Screen: VoucherForm };

/** Keystone open on Home, signed in as Mark, with records others save to: `push` is their save, `live` the listeners. */
async function open() {
  const { platform } = memoryPlatform(JSON.stringify(sampleState()));
  let push: (json: string) => void = () => {};
  let live: (on: boolean) => void = () => {};

  platform.watchState = (onChange, onLive) => {
    push = onChange;
    live = onLive ?? live;

    return () => {};
  };

  const store = await KeystoneStore.open({ ...platform, who: mark });

  render(
    <FeedbackProvider>
      <KeystoneProvider store={store} registry={buildRegistry([home, vouchers], [])}><Shell /></KeystoneProvider>
    </FeedbackProvider>,
  );

  return { store, push: (s: TerminalState) => act(() => push(JSON.stringify(s))), live: (on: boolean) => act(() => live(on)) };
}

/** The sample records after Ana changed CV-2026-0141 and logged it, on her computer. */
function anaChanged(text = 'CV-2026-0141 check 0001190 entered.') {
  const s = sampleState();

  return logged({ ...s, cv: s.cv.map((v) => (v.no === 'CV-2026-0141' ? { ...v, check: '0001190' } : v)) }, 'CV', text, at(ana));
}

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

describe('what arrives from others', () => {
  it('is told quietly, naming who saved it, and marks the screen it changed until it is opened', async () => {
    const { push } = await open();

    push(anaChanged());

    expect(await screen.findByText('From Ana Cruz: CV-2026-0141 check 0001190 entered.')).toBeTruthy();
    const rail = screen.getAllByRole('navigation', { name: 'Keystone' })[0];
    const marked = screen.getByRole('button', { name: 'Check Vouchers, changed by someone else' });

    expect(rail.contains(marked)).toBe(true);
    fireEvent.click(marked);
    expect(screen.queryByRole('button', { name: 'Check Vouchers, changed by someone else' })).toBeNull();
  });

  it('does not mark the screen that is open', async () => {
    window.location.hash = '#vouchers';
    const { push } = await open();

    push(anaChanged());
    expect(await screen.findByText('From Ana Cruz: CV-2026-0141 check 0001190 entered.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Check Vouchers, changed by someone else' })).toBeNull();
  });
});

describe('the rail', () => {
  it('says when live updates have stopped, and stops saying so when they are back', async () => {
    const { live } = await open();

    expect(screen.queryByText(LIVE_PAUSED)).toBeNull();
    live(false);
    expect(screen.getByRole('status').textContent).toBe(LIVE_PAUSED);
    live(true);
    expect(screen.queryByText(LIVE_PAUSED)).toBeNull();
  });
});

describe('a form holding a saved record', () => {
  it('says so when someone else changes the record, keeps what it holds, and stops saying so after a save here', async () => {
    window.location.hash = '#vouchers';
    const { store, push } = await open();
    const said = changedElsewhere('CV-2026-0141');

    expect(screen.getByText('The form')).toBeTruthy();
    expect(screen.queryByText(said)).toBeNull();

    // Someone else's change to another record says nothing here.
    const other = sampleState();

    push(logged({ ...other, cv: other.cv.map((v) => (v.no === 'CV-2026-0139' ? { ...v, check: '1' } : v)) }, 'CV', 'CV-2026-0139 check 1 entered.', at(ana)));
    expect(screen.queryByText(said)).toBeNull();

    push(anaChanged());
    expect(screen.getByText(said)).toBeTruthy();

    // A save here of the same record: the person's version is now the one saved.
    act(() => store.commit({ ...store.state, cv: store.state.cv.map((v) => (v.no === 'CV-2026-0141' ? { ...v, check: '0001191' } : v)) }));
    expect(screen.queryByText(said)).toBeNull();
  });
});
