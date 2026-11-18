import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SERVICES, type Accounts, type Connector, type Member, type MemberAccount, type MemberGrant, type NewAccount } from '@keystone/core';
import { App, buildRegistry, KeystoneStore } from '@keystone/kit';
import { memoryPlatform } from '@keystone/kit/testing';
import { accountsModule } from '../src';

// The User Accounts screen against a stand-in for the sign-in (the platform's `accounts` service), as the cloud build provides it:
// the CEO makes and removes staff accounts, staff only see who has one, anyone signed in changes their own
// password, and a computer with nobody signed in has none of it.

const owner: Member = { uid: 'owner-1', name: 'Mark Reyes', role: 'owner' };
const hr: Member = { uid: 'hr-1', name: 'Ana Cruz', role: 'staff' };

const { platform: base } = memoryPlatform();

/**
 * What a connected system lets the CEO give a staff member, worded as the attendance connector contributes it
 * (packages/connectors/attendance, which a module cannot import): the sentences below are the ones the screen has
 * always shown.
 */
const admin: MemberGrant = {
  field: 'attendanceAdmin',
  label: 'Attendance admin',
  as: 'an attendance admin',
  opens: 'the attendance tracker\'s admin screens',
  asks: {
    give: (who) => `${who} will open the attendance tracker's admin screens with their own email and password: interns, attendance, payroll and its settings.`,
    take: (who) => `${who} will no longer open the attendance tracker's admin screens with this account. An admin card they hold still works there.`,
  },
};

/** A connected system that contributes it, as the attendance tracker's connector does. */
const tracker: Connector = { id: 'tracker', name: 'Tracker', logo: 'tracker.png', open: async () => {}, memberGrant: admin };

/** The sign-in's members, with `create` recording what it was asked and answering as `made` says. */
function signIn(made: (a: NewAccount) => Promise<MemberAccount> = async (a) => ({ uid: 'new-1', name: a.name, email: a.email, role: 'staff' })) {
  const members: MemberAccount[] = [{ ...owner, email: 'mark@alphapremiergroup.com' }, { ...hr, email: 'ana.cruz@alphapremiergroup.com' }];

  const accounts: Accounts = {
    list: vi.fn(async () => members), create: vi.fn(made), remove: vi.fn(async () => {}), changePassword: vi.fn(async () => {}),
    rename: vi.fn(async () => {}), setGrant: vi.fn(async () => {}),
  };

  return accounts;
}

async function open(who?: Member, accounts?: Accounts, connectors: Connector[] = [tracker]) {
  const store = await KeystoneStore.open({ ...base, ...(who && { who }), ...(accounts && { provides: { [SERVICES.accounts]: accounts } }) });

  window.location.hash = '#accounts';
  render(<App store={store} registry={buildRegistry([accountsModule], connectors)} />);
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

/** Opens a row's ⋯ menu and picks Remove…, then answers the question with Remove account. */
async function removeFromRow(name: string) {
  fireEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove…' }));
  fireEvent.click(within(await screen.findByRole('alertdialog', { name: `Remove ${name}?` })).getByRole('button', { name: 'Remove account' }));
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
    expect(screen.queryByRole('button', { name: 'Change password' })).toBeNull();
  });

  it('shows staff who can open the records, and never offers to make an account', async () => {
    const accounts = signIn();

    await open(hr, accounts);
    const table = screen.getByRole('table', { name: 'User accounts' });

    expect(within(table).getAllByRole('row').map((r) => r.textContent)).toEqual([
      'NameEmailRole', 'Mark Reyesmark@alphapremiergroup.comCEO', 'Ana Cruz (you)ana.cruz@alphapremiergroup.comStaff',
    ]);
    expect(screen.getByText('2 people can open APG\'s records. Only the CEO makes accounts.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make account' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Actions for / })).toBeNull();
  });

  it('lets the CEO make a staff account, lists it and logs it', async () => {
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

  it('lets the CEO remove a staff account after asking, and logs it', async () => {
    const accounts = signIn();
    const store = await open(owner, accounts);

    // Only staff rows have a menu: never the CEO's own.
    expect(screen.queryByRole('button', { name: 'Actions for Mark Reyes' })).toBeNull();
    await removeFromRow('Ana Cruz');

    expect(accounts.remove).toHaveBeenCalledWith('hr-1');
    expect(within(screen.getByRole('table', { name: 'User accounts' })).queryByText('Ana Cruz')).toBeNull();
    expect(screen.getByText('1 person can open APG\'s records. Make an account for each new staff member.')).toBeInTheDocument();
    expect(store.state.log[0]).toMatchObject({
      mod: 'ACCT', text: 'Account removed for Ana Cruz (ana.cruz@alphapremiergroup.com); they can no longer open APG\'s records.',
    });
  });

  it('keeps the account listed, and says why, when the sign-in refuses to remove it', async () => {
    const accounts = signIn();

    vi.mocked(accounts.remove).mockRejectedValue(new Error('Only the CEO removes accounts.'));
    const store = await open(owner, accounts);
    const log = store.state.log.length;

    await removeFromRow('Ana Cruz');

    expect(await screen.findByText('Only the CEO removes accounts.')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'User accounts' })).getByText('Ana Cruz')).toBeInTheDocument();
    expect(store.state.log).toHaveLength(log);
  });

  it('lets staff change their own password after checking what they typed, and logs it', async () => {
    const accounts = signIn();
    const store = await open(hr, accounts);

    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    const dialog = await screen.findByRole('dialog', { name: 'Change password' });

    const type = async (current: string, next: string, again: string) => {
      fireEvent.change(within(dialog).getByLabelText('Current password'), { target: { value: current } });
      fireEvent.change(within(dialog).getByLabelText('New password'), { target: { value: next } });
      fireEvent.change(within(dialog).getByLabelText('New password again'), { target: { value: again } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Change password' }));
      await act(async () => {});
    };

    // A slip is caught before the sign-in is asked.
    await type('old-password', 'new-password-1', 'new-password-2');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('The new password and its repeat do not match.');
    expect(accounts.changePassword).not.toHaveBeenCalled();

    await type('old-password', 'new-password-1', 'new-password-1');
    expect(accounts.changePassword).toHaveBeenCalledWith('old-password', 'new-password-1');
    expect(screen.queryByRole('dialog', { name: 'Change password' })).toBeNull();
    expect(store.state.log[0]).toMatchObject({ mod: 'ACCT', text: 'Ana Cruz changed their password.' });
    expect(JSON.stringify(store.state)).not.toContain('new-password-1');
  });

  it('keeps the password form open with the sign-in\'s reason when it refuses', async () => {
    const accounts = signIn();

    vi.mocked(accounts.changePassword).mockRejectedValue(new Error('That is not your current password.'));
    const store = await open(owner, accounts);
    const log = store.state.log.length;

    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    const dialog = await screen.findByRole('dialog', { name: 'Change password' });

    fireEvent.change(within(dialog).getByLabelText('Current password'), { target: { value: 'not-it' } });
    fireEvent.change(within(dialog).getByLabelText('New password'), { target: { value: 'new-password-1' } });
    fireEvent.change(within(dialog).getByLabelText('New password again'), { target: { value: 'new-password-1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change password' }));
    await act(async () => {});

    expect(within(dialog).getByRole('alert')).toHaveTextContent('That is not your current password.');
    expect(within(dialog).getByRole('button', { name: 'Change password' })).toBeEnabled();
    expect(store.state.log).toHaveLength(log);
  });

  it('the CEO makes a staff member an attendance admin, and takes it back', async () => {
    const accounts = signIn();
    const store = await open(owner, accounts);
    const table = screen.getByRole('table', { name: 'User accounts' });

    // The CEO's own row offers nothing: a CEO opens the attendance tracker's admin screens already.
    expect(screen.queryByRole('button', { name: 'Actions for Mark Reyes' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Ana Cruz' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Make attendance admin…' }));
    const question = await screen.findByRole('alertdialog', { name: 'Make Ana Cruz an attendance admin?' });

    expect(question).toHaveTextContent('will open the attendance tracker\'s admin screens with their own email and password');
    expect(accounts.setGrant).not.toHaveBeenCalled();
    fireEvent.click(within(question).getByRole('button', { name: 'Make attendance admin' }));
    await act(async () => {});

    expect(accounts.setGrant).toHaveBeenCalledWith('hr-1', 'attendanceAdmin', true);
    expect(within(table).getByRole('row', { name: /^Ana Cruz ana\.cruz@alphapremiergroup\.com Staff · Attendance admin$/ })).toBeInTheDocument();
    expect(store.state.log[0].text).toBe('Ana Cruz (ana.cruz@alphapremiergroup.com) made an attendance admin.');

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Ana Cruz' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove as attendance admin…' }));
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: 'Remove Ana Cruz as attendance admin?' })).getByRole('button', { name: 'Remove as attendance admin' }));
    await act(async () => {});

    expect(accounts.setGrant).toHaveBeenLastCalledWith('hr-1', 'attendanceAdmin', false);
    expect(within(table).getByRole('row', { name: /^Ana Cruz ana\.cruz@alphapremiergroup\.com Staff$/ })).toBeInTheDocument();
  });

  it('a refusal from the cloud changes nothing on screen', async () => {
    const accounts = signIn();

    accounts.setGrant = vi.fn(async () => { throw new Error('Only the CEO decides who opens the attendance tracker\'s admin screens.'); });
    const store = await open(owner, accounts);
    const logged = store.state.log.length;

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Ana Cruz' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Make attendance admin…' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Make attendance admin' }));
    await act(async () => {});

    expect(await screen.findByText('Only the CEO decides who opens the attendance tracker\'s admin screens.')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'User accounts' })).queryByText(/Attendance admin/)).toBeNull();
    expect(store.state.log).toHaveLength(logged);
  });

  it('offers nothing of a connected system that is not installed, and still removes accounts', async () => {
    const accounts = signIn();

    vi.mocked(accounts.list).mockResolvedValue([{ ...owner, email: 'mark@alphapremiergroup.com' }, { ...hr, email: 'ana.cruz@alphapremiergroup.com', grants: ['attendanceAdmin'] }]);
    await open(owner, accounts, []);

    expect(within(screen.getByRole('table', { name: 'User accounts' })).getByRole('row', { name: /^Ana Cruz ana\.cruz@alphapremiergroup\.com Staff$/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Ana Cruz' }));
    expect((await screen.findAllByRole('menuitem')).map((i) => i.textContent)).toEqual(['Remove…']);
  });

  it('staff are offered none of it', async () => {
    await open(hr, signIn());
    expect(screen.queryByRole('button', { name: /^Actions for/ })).toBeNull();
  });
});
