import { companyOf, emptyState, KeystoneError, type TerminalState } from '@keystone/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeystoneStore } from '../src/store';
import { memoryPlatform } from './fakes';
import { sampleState, sampleText } from '@keystone/core/sample';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('store', () => {
  it('starts with no records when nothing is saved, never made-up ones (docs/adr/0018)', async () => {
    const store = await KeystoneStore.open(memoryPlatform().platform);
    expect(store.state).toEqual(emptyState());
    expect(companyOf(store.state).name).toBe('');
  });

  it('opens the records as saved', async () => {
    const store = await KeystoneStore.open(memoryPlatform(sampleText).platform);
    expect(store.state).toEqual(sampleState());
  });

  it('keeps a damaged file untouched until the person changes something', async () => {
    const { platform, files } = memoryPlatform('{ not json');
    const store = await KeystoneStore.open(platform);
    expect(store.state).toEqual(emptyState());
    await new Promise((r) => setTimeout(r, 300));
    expect(files.state).toBe('{ not json');
    expect(files.writes).toBe(0);
  });

  it('stops when the saved state cannot be read, rather than showing no records as if there were none', async () => {
    const { platform, files } = memoryPlatform();
    platform.loadState = async () => { throw new Error('offline'); };

    await expect(KeystoneStore.open(platform)).rejects.toThrow('offline');
    expect(files.writes).toBe(0);
  });

  it('keeps what modules store under ext through a save and a reload', async () => {
    vi.useFakeTimers();
    const { platform, files } = memoryPlatform(JSON.stringify({ ...sampleState(), ext: { payroll: { runs: 3 } } }));
    const store = await KeystoneStore.open(platform);
    expect(store.state.ext).toEqual({ payroll: { runs: 3 } });
    store.commit({ ...store.state, ext: { ...store.state.ext, leases: { open: 1 } } });
    await vi.advanceTimersByTimeAsync(300);
    const again = await KeystoneStore.open(platform);
    expect(again.state.ext).toEqual({ payroll: { runs: 3 }, leases: { open: 1 } });
    expect(files.writes).toBe(1);
  });

  it('writes once after a burst of changes', async () => {
    vi.useFakeTimers();
    const { platform, files } = memoryPlatform();
    const store = await KeystoneStore.open(platform);

    for (let i = 0; i < 5; i++) store.commit({ ...store.state, log: [...store.state.log] });
    await vi.advanceTimersByTimeAsync(300);
    expect(files.writes).toBe(1);
  });

  it('writes a waiting change at once when asked to flush, and nothing when none is waiting', async () => {
    vi.useFakeTimers();
    const { platform, files } = memoryPlatform();
    const store = await KeystoneStore.open(platform);

    await store.flush();
    expect(files.writes).toBe(0);

    store.commit({ ...store.state, ext: { ...store.state.ext, leases: { open: 1 } } });
    await store.flush();
    expect(files.writes).toBe(1);
    expect(JSON.parse(files.state!).ext).toEqual({ leases: { open: 1 } });

    // The delayed write it replaced does not run again.
    await vi.advanceTimersByTimeAsync(300);
    expect(files.writes).toBe(1);
  });

  it('skips a housekeeping step that throws and runs the rest', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const tidy = (s: TerminalState): TerminalState => ({ ...s, ext: { tidied: true } });
    const store = await KeystoneStore.open(memoryPlatform().platform, [() => { throw new Error('bad module'); }, tidy]);
    expect(store.state.ext).toEqual({ tidied: true });
    expect(console.error).toHaveBeenCalledOnce();
  });

  it('turns a refused rule into a sentence and leaves the state alone', async () => {
    const store = await KeystoneStore.open(memoryPlatform().platform);
    const before = store.state;
    const r = store.run(() => { throw new KeystoneError('The amount must be more than zero.'); });
    expect(r).toEqual({ ok: false, error: 'The amount must be more than zero.' });
    expect(store.state).toBe(before);
  });

  it('turns a crashing rule into a message instead of a crash', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = await KeystoneStore.open(memoryPlatform().platform);
    const r = store.run(() => { throw new TypeError('x is undefined'); });
    expect(r).toEqual({ ok: false, error: 'Something went wrong: x is undefined' });
  });

  it('tells listeners about a change and keeps drafts until everything is replaced', async () => {
    const store = await KeystoneStore.open(memoryPlatform().platform);
    const heard = vi.fn();
    store.subscribe(heard);
    store.setDraft('vouchers', { payee: 'Meralco' });
    const r = store.run((s) => ({ state: { ...s, ext: { a: 1 } }, record: 'done', message: 'Saved.' }));
    expect(r).toEqual({ ok: true, record: 'done', message: 'Saved.' });
    expect(heard).toHaveBeenCalledOnce();
    expect(store.draft('vouchers', () => ({ payee: '' }))).toEqual({ payee: 'Meralco' });
    store.replaceAll(sampleState());
    expect(store.draft('vouchers', () => ({ payee: '' }))).toEqual({ payee: '' });
  });
});
