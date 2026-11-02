import { FeedbackProvider } from '@keystone/ui';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeystoneProvider } from '../src/context';
import type { AppUpdate, AppUpdater, Platform } from '../src/platform';
import { buildRegistry } from '../src/registry';
import { KeystoneStore } from '../src/store';
import { CHECK_EVERY_MS, FIRST_CHECK_MS, UpdateNotice } from '../src/UpdateNotice';
import { memoryPlatform } from './fakes';

/** Keystone running at 0.1.2, with whatever the release endpoint answers next. */
async function mount(answers: (AppUpdate | null | Error)[], platformOverrides: Partial<Platform> = {}) {
  const checks = { count: 0 };

  const updater: AppUpdater = {
    currentVersion: async () => '0.1.2',
    async check() {
      const next = answers[Math.min(checks.count, answers.length - 1)];
      checks.count += 1;

      if (next instanceof Error) throw next;

      return next;
    },
  };

  const { platform, files } = memoryPlatform();
  const withUpdater: Platform = { ...platform, updater, ...platformOverrides };
  const store = await KeystoneStore.open(withUpdater);
  const registry = buildRegistry([], []);

  const view = render(
    <FeedbackProvider>
      <KeystoneProvider store={store} registry={registry}>
        <UpdateNotice />
      </KeystoneProvider>
    </FeedbackProvider>,
  );

  return { view, store, files, checks };
}

const release = (install: AppUpdate['install']): AppUpdate => ({ version: '0.2.0', notesUrl: 'https://example.test/v0.2.0', install });

describe('Keystone updating itself', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the running version, checks a few seconds after start, and offers the newer one', async () => {
    vi.useFakeTimers();
    const { checks } = await mount([release(async () => {})]);

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByText('Keystone 0.1.2')).toBeInTheDocument();
    expect(checks.count).toBe(0);

    await act(() => vi.advanceTimersByTimeAsync(FIRST_CHECK_MS));
    expect(checks.count).toBe(1);
    expect(screen.getByRole('status')).toHaveTextContent('Keystone 0.2.0 is ready.');
    expect(screen.getByRole('button', { name: 'Update and restart' })).toBeInTheDocument();
  });

  it('says nothing when up to date or offline, and looks again every 8 hours', async () => {
    vi.useFakeTimers();
    const { checks } = await mount([null, new Error('error sending request'), release(async () => {})]);

    await act(() => vi.advanceTimersByTimeAsync(FIRST_CHECK_MS));
    expect(screen.queryByRole('status')).toBeNull();

    await act(() => vi.advanceTimersByTimeAsync(CHECK_EVERY_MS));
    expect(checks.count).toBe(2);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();

    await act(() => vi.advanceTimersByTimeAsync(CHECK_EVERY_MS));
    expect(screen.getByRole('status')).toHaveTextContent('Keystone 0.2.0 is ready.');
  });

  it('writes the last save to disk before installing, then reports the download', async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    let report: (done: number | null) => void = () => {};
    let finish: () => void = () => {};

    const { store, files } = await mount([release((onProgress) => {
      order.push(`install with ${files.writes} write(s) done`);
      report = onProgress;

      return new Promise<void>((resolve) => { finish = resolve; });
    })]);

    await act(() => vi.advanceTimersByTimeAsync(FIRST_CHECK_MS));
    store.commit({ ...store.state, ext: { ...store.state.ext, pending: { saved: false } } });
    fireEvent.click(screen.getByRole('button', { name: 'Update and restart' }));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(order).toEqual(['install with 1 write(s) done']);
    expect(screen.getByRole('status')).toHaveTextContent('Downloading…');
    expect(screen.queryByRole('button', { name: 'Update and restart' })).toBeNull();

    act(() => report(0.42));
    expect(screen.getByRole('status')).toHaveTextContent('Downloading 42%');

    act(() => report(1));
    expect(screen.getByRole('status')).toHaveTextContent('Installing. Keystone restarts by itself.');
    await act(async () => finish());
  });

  it('says why an install failed and offers to try again', async () => {
    vi.useFakeTimers();
    await mount([release(async () => { throw new Error('signature does not match'); })]);

    await act(() => vi.advanceTimersByTimeAsync(FIRST_CHECK_MS));
    fireEvent.click(screen.getByRole('button', { name: 'Update and restart' }));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(screen.getByRole('alert')).toHaveTextContent('The update did not install: signature does not match');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('opens what’s new', async () => {
    vi.useFakeTimers();
    const opened: string[] = [];
    await mount([release(async () => {})], { openUrl: async (url) => { opened.push(url); } });

    await act(() => vi.advanceTimersByTimeAsync(FIRST_CHECK_MS));
    fireEvent.click(screen.getByRole('button', { name: 'What’s new' }));

    expect(opened).toEqual(['https://example.test/v0.2.0']);
  });

  it('shows nothing where Keystone cannot update itself (the browser preview)', async () => {
    const { platform } = memoryPlatform();
    const store = await KeystoneStore.open(platform);
    render(
      <FeedbackProvider>
        <KeystoneProvider store={store} registry={buildRegistry([], [])}>
          <span data-testid="notice"><UpdateNotice /></span>
        </KeystoneProvider>
      </FeedbackProvider>,
    );

    expect(screen.getByTestId('notice')).toBeEmptyDOMElement();
  });
});
