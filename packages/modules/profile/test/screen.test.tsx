import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Member } from '@keystone/core';
import { App, buildRegistry, KeystoneStore, type AppAccounts, type Platform } from '@keystone/kit';
import { profileModule } from '../src';

// The Profile screen against a stand-in for the sign-in (Platform.accounts), as the cloud build provides it: whoever is
// signed in changes their name, the rail shows it at once, and a computer with nobody signed in has no profile.

const owner: Member = { uid: 'owner-1', name: 'Deign Lazaro', role: 'owner' };

const base: Platform = {
  kind: 'browser', platform: 'web', loadState: async () => null, saveState: async () => {}, putPhoto: async () => {},
  photoUrl: async () => null, saveFile: async (name) => name, openFile: async () => null, locateApp: async () => null,
  launchApp: async () => { throw new Error('Not in tests.'); }, openUrl: async () => {},
};

const signIn = (): AppAccounts => ({
  list: vi.fn(async () => []), create: vi.fn(), remove: vi.fn(async () => {}), changePassword: vi.fn(async () => {}), rename: vi.fn(async () => {}),
});

async function open(who?: Member, accounts?: AppAccounts) {
  const store = await KeystoneStore.open({ ...base, ...(who && { who }), ...(accounts && { accounts }) });

  window.location.hash = '#profile';
  render(<App store={store} registry={buildRegistry([profileModule], [])} />);
  await act(async () => {});

  return store;
}

async function rename(name: string) {
  const form = screen.getByRole('form', { name: 'Your profile' });

  fireEvent.change(within(form).getByRole('textbox', { name: 'Your name' }), { target: { value: name } });
  fireEvent.click(within(form).getByRole('button', { name: 'Save name' }));
  await act(async () => {});
}

afterEach(() => {
  window.location.hash = '';
});

describe('the Profile screen', () => {
  it('changes the name of whoever is signed in, and the rail shows it at once', async () => {
    const accounts = signIn();
    const store = await open(owner, accounts);
    const rail = within(screen.getByRole('navigation', { name: 'Keystone' }));

    expect(rail.getByText('Deign Lazaro · Owner')).toBeInTheDocument();
    await rename('  Mark Anthony   Santos ');

    expect(accounts.rename).toHaveBeenCalledWith('Mark Anthony Santos');
    expect(rail.getByText('Mark Anthony Santos · Owner')).toBeInTheDocument();
    expect(store.ctx.who).toEqual({ uid: 'owner-1', name: 'Mark Anthony Santos', role: 'owner' });
    expect(store.state.log[0].text).toBe('Deign Lazaro changed their name to Mark Anthony Santos.');
  });

  it('keeps the name when the sign-in refuses, and says why on the form', async () => {
    const accounts = signIn();
    vi.mocked(accounts.rename).mockRejectedValue(new Error('Keystone could not reach APG\'s records. Check the connection and try again.'));
    const store = await open(owner, accounts);

    await rename('Mark Anthony Santos');

    expect(screen.getByRole('alert')).toHaveTextContent('Keystone could not reach APG\'s records.');
    expect(store.ctx.who?.name).toBe('Deign Lazaro');
    expect(store.state.log).toHaveLength(0);
  });

  it('refuses a blank name before asking the sign-in', async () => {
    const accounts = signIn();
    await open(owner, accounts);

    await rename('  ');

    expect(screen.getByRole('alert')).toHaveTextContent('Enter your name, as Keystone should show it.');
    expect(accounts.rename).not.toHaveBeenCalled();
  });

  it('with nobody signed in, says there is no profile', async () => {
    await open();

    expect(screen.getByText(/there is no profile to change/)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Your profile' })).toBeNull();
  });
});
