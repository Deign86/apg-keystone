import { FeedbackProvider } from '@keystone/ui';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeystoneProvider } from '../src/context';
import type { AppSession, Platform } from '../src/platform';
import { buildRegistry } from '../src/registry';
import { NOTE_USE_EVERY_MS } from '../src/Session';
import { Shell } from '../src/Shell';
import { KeystoneStore } from '../src/store';
import { memoryPlatform } from './fakes';

const MINUTE = 60_000;

/** What the session was told: each use noted, each sign-out, and what was saved by then. */
interface Told {
  used: number[];
  signOuts: number;
  order: string[];
}

/** The shell of a cloud build that signs out after 15 minutes unused, with what its session was told. */
async function mount(withSession = true) {
  const { platform, files } = memoryPlatform();
  const told: Told = { used: [], signOuts: 0, order: [] };

  const session: AppSession = {
    idleMs: 15 * MINUTE,
    used: (at) => { told.used.push(at); },
    signOut: async () => {
      told.signOuts += 1;
      told.order.push(`signed out with ${files.writes} write(s) done`);
    },
  };

  const cloud: Platform = withSession ? { ...platform, session } : platform;
  const store = await KeystoneStore.open(cloud);

  render(
    <FeedbackProvider>
      <KeystoneProvider store={store} registry={buildRegistry([], [])}>
        <Shell />
      </KeystoneProvider>
    </FeedbackProvider>,
  );

  return { store, told };
}

const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const warning = () => screen.queryByRole('alertdialog', { name: 'Still there?' });

describe('signing out', () => {
  afterEach(() => vi.useRealTimers());

  it('offers no sign-out and never times out without a sign-in', async () => {
    vi.useFakeTimers();
    const { told } = await mount(false);

    await wait(60 * MINUTE);
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
    expect(warning()).toBeNull();
    expect(told.signOuts).toBe(0);
  });

  it('signs out from the rail, writing the last save first', async () => {
    vi.useFakeTimers();
    const { store, told } = await mount();

    act(() => store.commit({ ...store.state, ext: { ...store.state.ext, pending: { saved: false } } }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await wait(0);

    expect(told.order).toEqual(['signed out with 1 write(s) done']);
  });

  it('asks "Still there?" a minute before, counting down, then signs out after 15 minutes unused', async () => {
    vi.useFakeTimers();
    const { told } = await mount();

    await wait(13 * MINUTE);
    expect(warning()).toBeNull();

    await wait(MINUTE);
    expect(warning()).toHaveTextContent('It signs out in 60 seconds to keep APG\'s records safe.');
    // The safe answer has the focus, so a key pressed by reflex keeps Keystone open.
    await wait(50);
    expect(screen.getByRole('button', { name: 'Stay signed in' })).toHaveFocus();

    await wait(59_000);
    expect(warning()).toHaveTextContent('It signs out in 1 second to keep APG\'s records safe.');
    expect(told.signOuts).toBe(0);

    await wait(1_000);
    expect(told.signOuts).toBe(1);

    await wait(5 * MINUTE);
    expect(told.signOuts).toBe(1);
  });

  it('starts the 15 minutes again with each key press, click or scroll', async () => {
    vi.useFakeTimers();
    const { told } = await mount();

    await wait(10 * MINUTE);
    fireEvent.keyDown(window, { key: 'a' });
    await wait(10 * MINUTE);
    fireEvent.wheel(window);
    await wait(10 * MINUTE);
    fireEvent.pointerDown(window);
    await wait(13 * MINUTE);

    expect(warning()).toBeNull();
    expect(told.signOuts).toBe(0);
  });

  it('once it has asked, only an answer keeps Keystone open: moving the mouse does not', async () => {
    vi.useFakeTimers();
    const { told } = await mount();

    await wait(14 * MINUTE);
    fireEvent.pointerMove(window);
    await wait(1_000);
    expect(warning()).toHaveTextContent('It signs out in 59 seconds');

    fireEvent.click(screen.getByRole('button', { name: 'Stay signed in' }));
    await wait(1_000);
    expect(warning()).toBeNull();

    await wait(13 * MINUTE);
    expect(warning()).toBeNull();
    expect(told.signOuts).toBe(0);
  });

  it('signs out at once when asked to on the warning', async () => {
    vi.useFakeTimers();
    const { told } = await mount();

    await wait(14 * MINUTE);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out now' }));
    await wait(0);

    expect(told.signOuts).toBe(1);
  });

  it('reads the clock, so a computer that slept past the 15 minutes signs out as it wakes', async () => {
    vi.useFakeTimers();
    const { told } = await mount();

    // Asleep: the clock moves on, but no timer runs.
    vi.setSystemTime(Date.now() + 20 * MINUTE);
    await wait(1_000);

    expect(told.signOuts).toBe(1);
  });

  it('tells the session when it was used, at most every 30 seconds, for the next start', async () => {
    vi.useFakeTimers();
    const { told } = await mount();
    const opened = Date.now();

    for (let i = 0; i < 10; i += 1) {
      await wait(5_000);
      fireEvent.keyDown(window, { key: 'a' });
    }

    expect(told.used).toEqual([opened, opened + NOTE_USE_EVERY_MS]);
  });
});
