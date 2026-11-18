import { FeedbackProvider } from '@keystone/ui';
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { emptyState, SERVICES, type Accounts, type Member } from '@keystone/core';
import { KeystoneProvider, useDraft, useKeystone, useModuleApp } from '../src/context';
import type { Platform } from '../src/platform';
import type { ModuleApp } from '../src/registry';
import { buildRegistry } from '../src/registry';
import { KeystoneStore } from '../src/store';
import { memoryPlatform } from './fakes';

// What a screen is handed: the capabilities it uses, by name, and never the store or the platform behind them.

type Screen = ReturnType<typeof useKeystone>;

/** What the probe screen last saw. */
interface Seen {
  screen?: Screen;
  app?: ModuleApp;
  draft?: string;
  setDraft?: (next: string) => void;
}

/** A screen that keeps what `useKeystone` gave it and a draft, so a test can use both. */
async function mount(platform: Platform) {
  const store = await KeystoneStore.open(platform);
  const seen: Seen = {};

  function Probe() {
    const [draft, setDraft] = useDraft('probe.draft', () => 'blank');

    seen.screen = useKeystone();
    seen.app = useModuleApp();
    seen.draft = draft;
    seen.setDraft = setDraft;

    return null;
  }

  const view = () => (
    <FeedbackProvider>
      <KeystoneProvider store={store} registry={buildRegistry([], [])}><Probe /></KeystoneProvider>
    </FeedbackProvider>
  );

  const { unmount } = render(view());

  return { store, seen, remount: () => { unmount(); render(view()); } };
}

describe('what a screen is given', () => {
  it('gets files, photos and the backup, and neither the store nor the platform', async () => {
    const { seen } = await mount(memoryPlatform().platform);

    expect(Object.keys(seen.screen!).sort()).toEqual(['backup', 'ctx', 'files', 'go', 'kind', 'notify', 'photos', 'registry', 'route', 'run', 'state']);
  });

  it('saves and opens a file and puts a photo through the platform', async () => {
    const { platform } = memoryPlatform();
    const putPhoto = vi.fn(async () => {});
    const openFile = vi.fn(async () => ({ name: 'backup.json', bytes: new Uint8Array([1]) }));
    const { seen } = await mount({ ...platform, putPhoto, openFile });
    const filters = [{ name: 'Keystone backup', extensions: ['json'] }];

    expect(await seen.screen!.files.save('a.json', new Uint8Array(), filters)).toBe('a.json');
    expect(await seen.screen!.files.open(filters)).toEqual({ name: 'backup.json', bytes: new Uint8Array([1]) });
    expect(openFile).toHaveBeenCalledWith(filters);
    await seen.screen!.photos.put('card.jpg', new Uint8Array([2]));
    expect(putPhoto).toHaveBeenCalledWith('card.jpg', new Uint8Array([2]));
  });

  it('returns the state after a rule from run', async () => {
    const { seen, store } = await mount(memoryPlatform().platform);
    let out: ReturnType<Screen['run']> | undefined;

    act(() => { out = seen.screen!.run((s) => ({ state: { ...s, ext: { a: 1 } }, record: null, message: 'Saved.' })); });
    expect(out).toEqual({ ok: true, record: null, message: 'Saved.', state: store.state });
    expect(seen.screen!.state).toBe(store.state);
  });

  it('restores a backup over everything, and drops the half-filled forms with it', async () => {
    const { seen, store, remount } = await mount(memoryPlatform().platform);
    const next = { ...emptyState(), ext: { restored: true } };

    act(() => seen.setDraft!('half typed'));
    remount();
    expect(seen.draft).toBe('half typed');
    act(() => seen.screen!.backup.restore(next));
    expect(store.state).toBe(next);
    remount();
    expect(seen.draft).toBe('blank');
  });

  it('finds the accounts service only where the platform offers one, and the rules see a changed name at once', async () => {
    const who: Member = { uid: 'u1', name: 'Ana Cruz', role: 'staff' };
    const rename = vi.fn(async () => {});
    const accounts: Accounts = { list: async () => [], create: vi.fn(), remove: async () => {}, changePassword: async () => {}, rename };
    const nobody = await mount(memoryPlatform().platform);

    // A computer where nobody signs in has no accounts, and a screen is told so by getting none.
    expect(nobody.seen.app!.service(SERVICES.accounts)).toBeUndefined();

    const signedIn = await mount({ ...memoryPlatform().platform, who, provides: { [SERVICES.accounts]: accounts } });
    const service = () => signedIn.seen.app!.service(SERVICES.accounts)!;

    await act(() => service().rename('Ana Reyes'));
    expect(rename).toHaveBeenCalledWith('Ana Reyes');
    expect(signedIn.store.ctx.who).toEqual({ ...who, name: 'Ana Reyes' });

    // A refused change leaves the name as it was.
    rename.mockRejectedValueOnce(new Error('Refused.'));
    await expect(service().rename('Nobody')).rejects.toThrow('Refused.');
    expect(signedIn.store.ctx.who?.name).toBe('Ana Reyes');
  });
});
