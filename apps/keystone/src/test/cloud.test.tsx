import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { bundledSeed, parseState, toDocuments, type DocumentChanges, type StateDocument, type TerminalState } from '@keystone/core';
import { KeystoneStore, type Platform } from '@keystone/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignIn, StartFailed } from '../Gate';
import { browserPlatform } from '../platform/browser';
import { cloudPlatform, MOVING_ELSEWHERE, NOT_MOVED_IN, NOT_READ, type RemoteDocs } from '../platform/cloud';
import { firebaseConfig } from '../platform/config';

// The records in the cloud (docs/adr/0009), against a cloud held in memory: moving in once, reading back, writing only
// what changed, and never saving over records it could not read.

const sample = (): TerminalState => structuredClone(bundledSeed.state);

function memoryCloud(start: StateDocument[] | null = null) {
  const docs = new Map((start ?? []).map((d) => [`${d.collection}/${d.id}`, d]));
  const writes: DocumentChanges[] = [];
  const cloud = { moved: start !== null, writes, moveIns: 0, failRead: false, failWrite: false };

  const remote: RemoteDocs = {
    readAll: async () => {
      if (cloud.failRead) throw Object.assign(new Error('offline'), { code: 'unavailable' });

      return cloud.moved ? [...docs.values()] : null;
    },
    moveIn: async (all) => {
      if (cloud.moved) return false;
      cloud.moveIns += 1;

      for (const d of all) docs.set(`${d.collection}/${d.id}`, d);
      cloud.moved = true;

      return true;
    },
    write: async (change) => {
      if (cloud.failWrite) throw Object.assign(new Error('refused'), { code: 'permission-denied' });
      cloud.writes.push(change);

      for (const d of change.set) docs.set(`${d.collection}/${d.id}`, d);

      for (const r of change.remove) docs.delete(`${r.collection}/${r.id}`);
    },
  };

  return { remote, cloud, docs };
}

function localPlatform(saved: string | null) {
  const files = { state: saved, writes: 0 };

  const platform: Platform = {
    ...browserPlatform,
    loadState: async () => files.state,
    saveState: async (json) => { files.state = json; files.writes += 1; },
  };

  return { platform, files };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('the records in the cloud', () => {
  it('moves this computer\'s records in once, then reads them from the cloud', async () => {
    const { remote, cloud } = memoryCloud();
    const mine = { ...sample(), ext: { payroll: { runs: [] } } };
    const store = await KeystoneStore.open(cloudPlatform(localPlatform(JSON.stringify(mine)).platform, remote));
    expect(store.state).toEqual(mine);
    expect(cloud.moveIns).toBe(1);

    // Another computer with nothing saved opens the same records.
    const other = await KeystoneStore.open(cloudPlatform(localPlatform(null).platform, remote));
    expect(other.state).toEqual(mine);
    expect(cloud.moveIns).toBe(1);
  });

  it('writes only the records a change touched, and keeps a copy on this computer', async () => {
    vi.useFakeTimers();
    const { remote, cloud } = memoryCloud(toDocuments(sample()));
    const local = localPlatform(null);
    const store = await KeystoneStore.open(cloudPlatform(local.platform, remote));
    const voucher = store.state.cv[0];

    store.commit({ ...store.state, cv: store.state.cv.map((v) => (v === voucher ? { ...v, check: '000777' } : v)) });
    await vi.advanceTimersByTimeAsync(300);
    expect(cloud.writes).toHaveLength(1);
    expect(cloud.writes[0].set.map((d) => d.collection)).toEqual(['cv']);
    expect(cloud.writes[0].remove).toEqual([]);
    expect(JSON.parse(local.files.state!).cv[0].check).toBe('000777');
  });

  it('never moves the sample data in from a computer with no records, or with a damaged file', async () => {
    for (const saved of [null, '{ not json']) {
      const { remote, cloud } = memoryCloud();
      await expect(KeystoneStore.open(cloudPlatform(localPlatform(saved).platform, remote))).rejects.toThrow(NOT_MOVED_IN);
      expect(cloud.moved).toBe(false);
    }
  });

  it('opens the records another computer moved in first, instead of its own', async () => {
    const { remote, cloud, docs } = memoryCloud();
    const theirs = { ...sample(), cv: sample().cv.slice(0, 1) };
    const readAll = remote.readAll;
    // The other computer moves its records in while this one is still reading its own file.
    remote.readAll = async () => {
      remote.readAll = readAll;

      for (const d of toDocuments(theirs)) docs.set(`${d.collection}/${d.id}`, d);
      cloud.moved = true;

      return null;
    };

    const store = await KeystoneStore.open(cloudPlatform(localPlatform(JSON.stringify(sample())).platform, remote));
    expect(store.state).toEqual(theirs);
    expect(cloud.moveIns).toBe(0);
  });

  it('says so when another computer is still moving its records in', async () => {
    const { remote } = memoryCloud();
    remote.moveIn = async () => false;
    await expect(KeystoneStore.open(cloudPlatform(localPlatform(JSON.stringify(sample())).platform, remote))).rejects.toThrow(MOVING_ELSEWHERE);
  });

  it('stops when the cloud cannot be read, and refuses to save over records it never read', async () => {
    const { remote, cloud } = memoryCloud(toDocuments(sample()));
    cloud.failRead = true;
    const platform = cloudPlatform(localPlatform(JSON.stringify(sample())).platform, remote);
    await expect(KeystoneStore.open(platform)).rejects.toThrow('offline');
    await expect(platform.saveState(JSON.stringify(sample()))).rejects.toThrow(NOT_READ);
    expect(cloud.writes).toEqual([]);
  });

  it('writes a refused change again with the next save', async () => {
    const { remote, cloud } = memoryCloud(toDocuments(sample()));
    const platform = cloudPlatform(localPlatform(null).platform, remote);
    const s = parseState((await platform.loadState())!);
    const first = { ...s, log: [{ when: '2026-11-11 09:30', mod: 'CV', text: 'First.' }, ...s.log] };
    const second = { ...first, log: [{ when: '2026-11-11 09:31', mod: 'CV', text: 'Second.' }, ...first.log] };

    cloud.failWrite = true;
    await expect(platform.saveState(JSON.stringify(first))).rejects.toThrow('refused');
    cloud.failWrite = false;
    await platform.saveState(JSON.stringify(second));
    expect(cloud.writes.at(-1)!.set.map((d) => JSON.parse(d.body).text)).toEqual(['First.', 'Second.']);
  });

  it('writes nothing to the cloud when a save changes nothing', async () => {
    const { remote, cloud } = memoryCloud(toDocuments(sample()));
    const platform = cloudPlatform(localPlatform(null).platform, remote);
    const text = (await platform.loadState())!;
    await platform.saveState(text);
    expect(cloud.writes).toEqual([]);
  });
});

describe('the Firebase project a build uses', () => {
  it('is none unless the build names one', () => {
    expect(firebaseConfig({})).toBeNull();
    expect(firebaseConfig({ VITE_FIREBASE_API_KEY: 'key', VITE_FIREBASE_PROJECT_ID: ' ', VITE_FIREBASE_APP_ID: 'app' })).toBeNull();
  });

  it('takes the project from the build\'s variables', () => {
    expect(firebaseConfig({ VITE_FIREBASE_API_KEY: 'key', VITE_FIREBASE_PROJECT_ID: 'apg-keystone', VITE_FIREBASE_APP_ID: 'app' })).toEqual({
      apiKey: 'key', projectId: 'apg-keystone', appId: 'app', authDomain: 'apg-keystone.firebaseapp.com',
    });
  });
});

describe('before Keystone opens', () => {
  it('signs in with the email and password typed, and shows why when refused', async () => {
    const signIn = vi.fn(async (email: string, password: string) => {
      if (password !== 'right') throw new Error('That email and password do not match an account.');
      expect(email).toBe('owner@alphapremiergroup.com');
    });

    render(<SignIn signIn={signIn} />);
    const button = screen.getByRole('button', { name: 'Sign in' });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' owner@alphapremiergroup.com ' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(button);
    expect(await screen.findByText('That email and password do not match an account.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'right' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(signIn).toHaveBeenLastCalledWith('owner@alphapremiergroup.com', 'right'));
  });

  it('says why the records could not be opened, and offers to try again or switch accounts', () => {
    const retry = vi.fn();
    const signOut = vi.fn();
    render(<StartFailed reason="Keystone could not reach the cloud." onRetry={retry} onSignOut={signOut} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Keystone could not reach the cloud.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in as someone else' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(signOut).toHaveBeenCalledOnce();
  });
});
