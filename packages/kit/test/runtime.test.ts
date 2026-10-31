import { bundledSeed, KeystoneError, type Connector, type TerminalState } from '@keystone/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Connections } from '../src/connections';
import { KeystoneStore } from '../src/store';
import { memoryPlatform, okConnector } from './fakes';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('store', () => {
  it('starts from the sample data when nothing is saved', async () => {
    const store = await KeystoneStore.open(memoryPlatform().platform);
    expect(store.state).toEqual(bundledSeed.state);
    expect(store.state).not.toBe(bundledSeed.state);
  });

  it('keeps a damaged file untouched until the person changes something', async () => {
    const { platform, files } = memoryPlatform('{ not json');
    const store = await KeystoneStore.open(platform);
    expect(store.state).toEqual(bundledSeed.state);
    await new Promise((r) => setTimeout(r, 300));
    expect(files.state).toBe('{ not json');
    expect(files.writes).toBe(0);
  });

  it('keeps what modules store under ext through a save and a reload', async () => {
    vi.useFakeTimers();
    const { platform, files } = memoryPlatform(JSON.stringify({ ...bundledSeed.state, ext: { payroll: { runs: 3 } } }));
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
    store.replaceAll(structuredClone(bundledSeed.state));
    expect(store.draft('vouchers', () => ({ payee: '' }))).toEqual({ payee: '' });
  });
});

describe('connected systems', () => {
  it('isolates a connector that throws or hangs', async () => {
    const crashing = okConnector('crashing', { health: async () => { throw new Error('boom'); } });
    const hanging = okConnector('hanging', { health: () => new Promise(() => {}) });
    const fine = okConnector('fine');
    const c = new Connections(memoryPlatform().platform, [crashing, hanging, fine]);
    await Promise.all([c.refresh(crashing), c.refresh(fine)]);
    expect(c.statusOf('crashing').health).toEqual({ state: 'offline', detail: 'boom' });
    expect(c.statusOf('fine').health?.state).toBe('ready');
    await expect(c.safely(hanging, 'health', (env) => hanging.health(env), 30)).rejects.toThrow('did not answer');
  });

  it('asks for figures only from a system that is ready, and survives their failure', async () => {
    const figures = vi.fn(async () => [{ label: 'In now', value: '2', caption: '' }]);
    const offline = okConnector('kiosk', { health: async () => ({ state: 'offline', detail: 'down' }), figures });
    const broken = okConnector('site', { figures: async () => { throw new Error('500'); } });
    const c = new Connections(memoryPlatform().platform, [offline, broken]);
    await c.refresh(offline);
    await c.refresh(broken);
    expect(figures).not.toHaveBeenCalled();
    expect(c.statusOf('site')).toMatchObject({ health: { state: 'ready' }, figures: null });
  });

  it('keeps secrets in the keychain, never in the settings file', async () => {
    const { platform, files } = memoryPlatform();

    const site: Connector = okConnector('website', {
      settings: [
        { key: 'email', label: 'Email', kind: 'text' },
        { key: 'password', label: 'Password', kind: 'secret' },
        { key: 'baseUrl', label: 'Website', kind: 'url', default: 'https://alphapremiergroup.com' },
      ],
    });

    const c = new Connections(platform, [site]);
    await c.configure(site, { email: 'keystone@alphapremiergroup.com' }, { password: 'hunter2' });
    expect(JSON.stringify(files.settings)).not.toContain('hunter2');
    expect(files.secrets.get('website.password')).toBe('hunter2');
    expect(c.settingsOf(site)).toEqual({ email: 'keystone@alphapremiergroup.com', baseUrl: 'https://alphapremiergroup.com' });
    expect(await c.env(site).secret('password')).toBe('hunter2');
  });

  it('gives a stable snapshot between refreshes', async () => {
    const fine = okConnector('fine');
    const c = new Connections(memoryPlatform().platform, [fine]);
    expect(c.statusOf('fine')).toBe(c.statusOf('fine'));
    await c.refresh(fine);
    const snapshot = c.allStatuses();
    expect(c.allStatuses()).toBe(snapshot);
    await c.refresh(fine);
    expect(c.allStatuses()).not.toBe(snapshot);
  });
});
