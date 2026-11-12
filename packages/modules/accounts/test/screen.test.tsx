import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Member } from '@keystone/core';
import { App, buildRegistry, KeystoneStore, type AppAccounts, type MemberAccount, type NewAccount, type Platform } from '@keystone/kit';
import { accountsModule } from '../src';

// The User Accounts screen against a stand-in for the sign-in (Platform.accounts), as the cloud build provides it:
// the owner makes an account, staff only see who has one, and a computer with nobody signed in has none to make.

const owner: Member = { uid: 'owner-1', name: 'Mark Reyes', role: 'owner' };
const hr: Member = { uid: 'hr-1', name: 'Ana Cruz', role: 'staff' };

const base: Platform = {
  kind: 'browser', platform: 'web', loadState: async () => null, saveState: async () => {}, putPhoto: async () => {},
  photoUrl: async () => null, saveFile: async (name) => name, openFile: async () => null, locateApp: async () => null,
  launchApp: async () => { throw new Error('Not in tests.'); }, openUrl: async () => {},
};

/** The sign-in's members, with `create` recording what it was asked and answering as `made` says. */
function signIn(made: (a: NewAccount) => Promise<MemberAccount> = async (a) => ({ uid: 'new-1', name: a.name, email: a.email, role: 'staff' })) {
  const members: MemberAccount[] = [{ ...owner, email: 'mark@alphapremiergroup.com' }, { ...hr, email: 'ana.cruz@alphapremiergroup.com' }];
  const accounts: AppAccounts = { list: vi.fn(async () => members), create: vi.fn(made) };

  return accounts;
}

async function open(who?: Member, accounts?: AppAccounts) {
  const store = await KeystoneStore.open({ ...base, ...(who && { who }), ...(accounts && { accounts }) });

  window.location.hash = '#accounts';
  render(<App store={store} registry={buildRegistry([accountsModule], [])} />);
  await act(async () => {});

  return store;
}

async function fill(dialog: HTMLElement, name: string, email: string, password: string) {
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), { target: { value: name } });
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Email' }), { target: { value: email } });
  fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Make account' }));
  await act(async () => {});
}

afterEach(() => {
  window.location.hash = '';
});

describe('User Accounts', () => {
  it('has no accounts to make where the records are on this computer', async () => {
    await open();

    expect(screen.getByRole('heading', { level: 1, name: 'User Accounts' })).toBeInTheDocument();
    expect(screen.getByText(/^This Keystone keeps its records on this computer, where nobody signs in/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make account' })).toBeNull();
  });

  it('shows staff who can open the records, and never offers to make an account', async () => {
    const accounts = signIn();

    await open(hr, accounts);
    const table = screen.getByRole('table', { name: 'User accounts' });

    expect(within(table).getAllByRole('row').map((r) => r.textContent)).toEqual([
      'NameEmailRole', 'Mark Reyesmark@alphapremiergroup.comOwner', 'Ana Cruz (you)ana.cruz@alphapremiergroup.comStaff',
    ]);
    expect(screen.getByText('2 people can open APG\'s records. Only the owner makes accounts.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make account' })).toBeNull();
  });

  it('lets the owner make a staff account, lists it and logs it', async () => {
    const accounts = signIn();
    const store = await open(owner, accounts);

    fireEvent.click(screen.getByRole('button', { name: 'Make account' }));
    const dialog = await screen.findByRole('dialog', { name: 'Make account' });

    // A slip is caught before the sign-in is asked.
    await fill(dialog, 'Liza Bautista', 'liza.bautista@alphapremiergroup.com', 'short');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('The password needs at least 8 characters.');
    expect(accounts.create).not.toHaveBeenCalled();

    await fill(dialog, ' Liza  Bautista ', 'Liza.Bautista@alphapremiergroup.com', 'correct horse');
    expect(accounts.create).toHaveBeenCalledWith({ name: 'Liza Bautista', email: 'liza.bautista@alphapremiergroup.com', password: 'correct horse' });
    expect(screen.queryByRole('dialog', { name: 'Make account' })).toBeNull();
    expect(within(screen.getByRole('table', { name: 'User accounts' })).getByRole('row', { name: /^Liza Bautista liza.bautista@alphapremiergroup.com Staff$/ })).toBeInTheDocument();
    expect(screen.getByText('3 people can open APG\'s records. Make an account for each new staff member.')).toBeInTheDocument();
    expect(store.state.log[0]).toMatchObject({ mod: 'ACCT', text: 'Account made for Liza Bautista (liza.bautista@alphapremiergroup.com), staff.' });
  });

  it('keeps the form open with the sign-in\'s reason when it refuses', async () => {
    const accounts = signIn(async () => { throw new Error('That email already has a sign-in.'); });
    const store = await open(owner, accounts);
    const log = store.state.log.length;

    fireEvent.click(screen.getByRole('button', { name: 'Make account' }));
    const dialog = await screen.findByRole('dialog', { name: 'Make account' });

    await fill(dialog, 'Liza Bautista', 'liza.bautista@alphapremiergroup.com', 'correct horse');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('That email already has a sign-in.');
    expect(within(dialog).getByRole('button', { name: 'Make account' })).toBeEnabled();
    expect(store.state.log).toHaveLength(log);
  });

  it('says why the accounts could not be read, and reads them again', async () => {
    const accounts = signIn();
    const members = await accounts.list();

    vi.mocked(accounts.list).mockRejectedValue(new Error('Keystone could not reach the cloud.'));
    await open(owner, accounts);
    expect(screen.getByRole('alert')).toHaveTextContent('Keystone could not reach the cloud.');
    expect(screen.getByRole('button', { name: 'Make account' })).toBeDisabled();

    vi.mocked(accounts.list).mockResolvedValue(members);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await act(async () => {});
    expect(screen.queryByRole('alert')).toBeNull();
    expect(within(screen.getByRole('table', { name: 'User accounts' })).getAllByRole('row')).toHaveLength(3);
  });
});
