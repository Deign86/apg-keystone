import { FeedbackProvider } from '@keystone/ui';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeystoneProvider } from '../src/context';
import { buildRegistry } from '../src/registry';
import { Shell } from '../src/Shell';
import { DAMAGED, KeystoneStore } from '../src/store';
import { memoryPlatform } from './fakes';

// What the rail says when the records did not open or did not save: a sentence, at the moment it becomes true.

async function mount(saved: string | null, saveState?: () => Promise<void>) {
  const { platform, files } = memoryPlatform(saved);

  if (saveState) platform.saveState = saveState;
  const store = await KeystoneStore.open(platform);

  render(
    <FeedbackProvider>
      <KeystoneProvider store={store} registry={buildRegistry([], [])}><Shell /></KeystoneProvider>
    </FeedbackProvider>,
  );

  return { store, files };
}

const notices = () => screen.queryAllByRole('alert').map((a) => a.textContent);

describe('the rail', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('says nothing when the records opened', async () => {
    await mount(null);
    expect(notices()).toEqual([]);
  });

  it('says that the saved records are damaged, and stops saying so once a change has replaced them', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { store, files } = await mount('{ not json');

    expect(notices()).toEqual([DAMAGED]);
    expect(files.state).toBe('{ not json');
    act(() => store.commit({ ...store.state, ext: { a: 1 } }));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(notices()).toEqual([]);
  });

  it('says that a save failed as soon as it has, without waiting for the next change', async () => {
    vi.useFakeTimers();
    const { store } = await mount(null, async () => { throw new Error('disk full'); });

    act(() => store.commit({ ...store.state, ext: { a: 1 } }));
    expect(notices()).toEqual([]);
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(notices()).toEqual(['Could not save: Error: disk full']);
  });
});
