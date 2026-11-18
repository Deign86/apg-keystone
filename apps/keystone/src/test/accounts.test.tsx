import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isOwner, SERVICES, type Accounts, type Member, type MemberAccount, type MemberGrant } from '@keystone/core';
import { App, buildRegistry, KeystoneStore } from '@keystone/kit';
import { connectors } from '../connectors';
import { builtInModules } from '../modules';
import { browserPlatform } from '../platform/browser';
import { grantsHeld, grantToWrite } from '../platform/grants';

// User Accounts as shipped, with the parts that ship: the platform offers the accounts service, the attendance
// connector contributes "attendance admin", and the accounts module shows it without naming it (docs/adr/0030, 0033).
// The words are the ones e2e/cloud/accounts.e2e.ts asks for.

const ceo: Member = { uid: 'owner-1', name: 'Mark Reyes', role: 'owner' };
const ana: Member = { uid: 'hr-1', name: 'Ana Cruz', role: 'staff' };
const grants = connectors.flatMap((c) => c.memberGrant ?? []);

/** A sign-in that keeps its members in memory and refuses what the cloud platform refuses. */
function signIn(who: Member) {
  const members: MemberAccount[] = [{ ...ceo, email: 'mark@keystone.test' }, { ...ana, email: 'ana.cruz@keystone.test' }];
  const wrote: string[] = [];

  const accounts: Accounts = {
    list: async () => members.map((m) => ({ ...m })),
    create: vi.fn(),
    remove: async () => {},
    changePassword: async () => {},
    rename: async () => {},
    setGrant: async (uid, field, on) => {
      const grant = grantToWrite(grants, field, who);
      const m = members.find((x) => x.uid === uid);

      wrote.push(`${uid} ${grant.field} ${on}`);

      if (m) m.grants = grantsHeld(grants, (f) => (f === grant.field ? on : (m.grants ?? []).includes(f)));
    },
  };

  return { accounts, wrote };
}

async function open(who: Member, without: string[] = []) {
  const { accounts, wrote } = signIn(who);
  const store = await KeystoneStore.open({ ...browserPlatform, loadState: async () => null, saveState: async () => {}, who, provides: { [SERVICES.accounts]: accounts } });

  window.location.hash = '#accounts';
  render(<App store={store} registry={buildRegistry(builtInModules, connectors.filter((c) => !without.includes(c.id)))} />);
  await act(async () => {});

  return { store, wrote };
}

afterEach(() => {
  window.location.hash = '';
});

describe('User Accounts with the attendance connector, as shipped', () => {
  it('lets the CEO make a staff member an attendance admin and take it back, in the words it has always used', async () => {
    const { store, wrote } = await open(ceo);
    const table = screen.getByRole('table', { name: 'User accounts' });

    expect(within(table).getByRole('row', { name: /^Ana Cruz ana\.cruz@keystone\.test Staff$/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Ana Cruz' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Make attendance admin…' }));
    const question = await screen.findByRole('alertdialog', { name: 'Make Ana Cruz an attendance admin?' });

    expect(question).toHaveTextContent('Ana Cruz (ana.cruz@keystone.test) will open the attendance tracker\'s admin screens with their own email and password: interns, attendance, payroll and its settings.');
    fireEvent.click(within(question).getByRole('button', { name: 'Make attendance admin' }));
    await act(async () => {});

    // The field the kiosk reads, and firestore.rules name.
    expect(wrote).toEqual(['hr-1 attendanceAdmin true']);
    expect(within(table).getByRole('row', { name: /^Ana Cruz ana\.cruz@keystone\.test Staff · Attendance admin$/ })).toBeInTheDocument();
    expect(await screen.findByText('Ana Cruz can now open the attendance tracker\'s admin screens.')).toBeInTheDocument();
    expect(store.state.log[0].text).toBe('Ana Cruz (ana.cruz@keystone.test) made an attendance admin.');

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Ana Cruz' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove as attendance admin…' }));
    const back = await screen.findByRole('alertdialog', { name: 'Remove Ana Cruz as attendance admin?' });

    expect(back).toHaveTextContent('Ana Cruz (ana.cruz@keystone.test) will no longer open the attendance tracker\'s admin screens with this account. An admin card they hold still works there.');
    fireEvent.click(within(back).getByRole('button', { name: 'Remove as attendance admin' }));
    await act(async () => {});

    expect(wrote).toEqual(['hr-1 attendanceAdmin true', 'hr-1 attendanceAdmin false']);
    expect(within(table).getByRole('row', { name: /^Ana Cruz ana\.cruz@keystone\.test Staff$/ })).toBeInTheDocument();
    expect(store.state.log[0].text).toBe('Ana Cruz (ana.cruz@keystone.test) is no longer an attendance admin.');
  });

  it('offers none of it once the attendance connector is removed, and nothing else changes', async () => {
    await open(ceo, ['attendance']);

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Ana Cruz' }));
    expect((await screen.findAllByRole('menuitem')).map((i) => i.textContent)).toEqual(['Remove…']);
  });
});

describe('what the cloud platform writes on a member', () => {
  const admin = grants.find((g) => g.field === 'attendanceAdmin');
  const made: MemberGrant = { field: 'role', label: 'Owner', as: 'an owner', opens: 'everything', asks: { give: () => '', take: () => '' } };

  it('writes only a field a connector contributed, and only for the CEO', () => {
    expect(grantToWrite(grants, 'attendanceAdmin', ceo)).toBe(admin);
    expect(() => grantToWrite(grants, 'attendanceAdmin', ana)).toThrow('Only the CEO decides who opens the attendance tracker\'s admin screens.');
    // Not `role`, not a field a part made up, not even for the CEO.
    expect(() => grantToWrite(grants, 'role', ceo)).toThrow('This Keystone cannot keep that.');
    expect(() => grantToWrite(grants, 'superuser', ceo)).toThrow('This Keystone cannot keep that.');
    expect(() => grantToWrite([], 'attendanceAdmin', ceo)).toThrow('This Keystone cannot keep that.');
  });

  it('never lets a connector claim one of a member\'s own fields', () => {
    const r = buildRegistry([], [{ id: 'rogue', name: 'Rogue', logo: 'rogue.png', open: async () => {}, memberGrant: made }]);

    expect(r.connectors).toEqual([]);
    expect(r.refused).toEqual([{ id: 'rogue', reason: 'Connector "rogue" offers something for members that cannot be kept: the field "role" is the member\'s own.' }]);
  });

  it('reads a member\'s grants as yes only where the document says true', () => {
    expect(grantsHeld(grants, (f) => f === 'attendanceAdmin')).toEqual(['attendanceAdmin']);
    expect(grantsHeld(grants, () => false)).toEqual([]);
    expect(grantsHeld([], () => true)).toEqual([]);
  });

  it('asks "is this the CEO" in one place', () => {
    expect([isOwner(ceo), isOwner(ana), isOwner(undefined), isOwner(null)]).toEqual([true, false, false, false]);
  });
});
