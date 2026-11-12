import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  emptyState, fromDocuments, parseState, toDocuments, type DocumentChanges, type Member, type StateDocument, type TerminalState,
} from '@keystone/core';
import { documentLayout, KeystoneStore, type Platform } from '@keystone/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignIn, StartFailed } from '../Gate';
import { builtInModules } from '../modules';
import { browserPlatform } from '../platform/browser';
import { cloudPlatform, NOT_READ, NOT_STARTED, type RemoteDocs } from '../platform/cloud';
import { firebaseConfig, firebaseEmulators } from '../platform/config';
import type { StoredText } from '../platform/web-storage';
import { sampleState } from '@keystone/core/sample';

// The records in the cloud (docs/adr/0009), against a cloud held in memory: the owner starting them empty and nothing
// copied in from a computer (docs/adr/0018), reading back, writing only what changed, never saving over records it
// could not read, and writing a save the page closed on before the cloud had it (docs/adr/0013).

const owner: Member = { uid: 'ceo-1', name: 'Mark Reyes', role: 'owner' };
const staff: Member = { uid: 'hr-1', name: 'Ana Cruz', role: 'staff' };

const sample = (): TerminalState => sampleState();

/** A write the cloud has not answered yet: `land` puts it in the cloud, `confirm` answers that it is there. */
interface Held {
  land(): void;
  confirm(): void;
}

function memoryCloud(start: StateDocument[] | null = null) {
  const docs = new Map((start ?? []).map((d) => [`${d.collection}/${d.id}`, d]));
  const writes: DocumentChanges[] = [];
  const held: Held[] = [];
  // `hold`: writes wait in `held` instead of landing at once, as when the page closes before Firestore sends them.
  const cloud = { started: start !== null, writes, starts: 0, failRead: false, failWrite: false, hold: false, held };

  const remote: RemoteDocs = {
    readAll: async () => {
      if (cloud.failRead) throw Object.assign(new Error('offline'), { code: 'unavailable' });

      return cloud.started ? [...docs.values()] : null;
    },
    start: async () => {
      cloud.starts += 1;
      cloud.started = true;
    },
    write: async (change) => {
      if (cloud.failWrite) throw Object.assign(new Error('refused'), { code: 'permission-denied' });

      const land = () => {
        cloud.writes.push(change);

        for (const d of change.set) docs.set(`${d.collection}/${d.id}`, d);

        for (const r of change.remove) docs.delete(`${r.collection}/${r.id}`);
      };

      if (!cloud.hold) return land();

      await new Promise<void>((confirm) => held.push({ land, confirm }));
    },
  };

  return { remote, cloud, docs };
}

/** A record in the memory cloud, read back. */
const recordIn = (docs: Map<string, StateDocument>, collection: string, id: string) => {
  const d = docs.get(`${collection}/${id}`);

  return d ? JSON.parse(d.body) : null;
};

/** Where this computer notes saves the cloud has not confirmed, in memory, so a test can reopen Keystone with it. */
function memoryText(value: string | null = null): StoredText & { value: string | null } {
  const kept = {
    value,
    get: () => kept.value,
    set: (v: string | null) => { kept.value = v; },
  };

  return kept;
}

/** This computer's own saved records, counting every read and write the cloud platform makes of them. */
function localPlatform(saved: string | null) {
  const files = { state: saved, reads: 0, writes: 0 };

  const platform: Platform = {
    ...browserPlatform,
    loadState: async () => {
      files.reads += 1;

      return files.state;
    },
    saveState: async (json) => { files.state = json; files.writes += 1; },
  };

  return { platform, files };
}

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe('the records in the cloud', () => {
  it('the owner\'s first sign-in starts the records empty, copying in nothing this computer holds', async () => {
    const { remote, cloud, docs } = memoryCloud();
    const local = localPlatform(JSON.stringify(sample()));
    const store = await KeystoneStore.open(cloudPlatform(local.platform, remote, {}, owner));

    expect(store.state).toEqual(emptyState());
    expect(cloud.starts).toBe(1);
    expect(docs.size).toBe(0);
    expect(local.files.reads).toBe(0);

    // Staff on another computer then open the same records, empty too, and starting them is not done again.
    const other = await KeystoneStore.open(cloudPlatform(localPlatform(JSON.stringify(sample())).platform, remote, {}, staff));
    expect(other.state).toEqual(emptyState());
    expect(cloud.starts).toBe(1);
  });

  it('staff, or a member not known yet, are told the owner starts the records, and nothing is written', async () => {
    for (const who of [staff, undefined]) {
      const { remote, cloud } = memoryCloud();
      await expect(KeystoneStore.open(cloudPlatform(localPlatform(JSON.stringify(sample())).platform, remote, {}, who))).rejects.toThrow(NOT_STARTED);
      expect(cloud.started).toBe(false);
      expect(cloud.writes).toEqual([]);
    }
  });

  it('opens what the cloud holds, never this computer\'s own records', async () => {
    const theirs = { ...sample(), cv: sample().cv.slice(0, 1) };
    const { remote } = memoryCloud(toDocuments(theirs));
    const local = localPlatform(JSON.stringify(sample()));
    const store = await KeystoneStore.open(cloudPlatform(local.platform, remote, {}, owner));

    expect(store.state).toEqual(theirs);
    expect(local.files.reads).toBe(0);
  });

  it('writes only the records a change touched, and keeps no copy on this computer', async () => {
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
    expect(local.files.writes).toBe(0);
    expect(local.files.state).toBeNull();
  });

  it('keeps the company\'s details as one document of their own, written only when they change (docs/adr/0018)', async () => {
    vi.useFakeTimers();
    const { remote, cloud, docs } = memoryCloud(toDocuments(sample()));
    const store = await KeystoneStore.open(cloudPlatform(localPlatform(null).platform, remote, {}, owner));

    expect(recordIn(docs, 'company', 'details')).toEqual(sample().company);
    expect(store.state.company).toEqual(sample().company);

    store.commit({ ...store.state, company: { ...store.state.company!, phone: '02 8650 2541' } });
    await vi.advanceTimersByTimeAsync(300);
    expect(cloud.writes[0].set.map((d) => `${d.collection}/${d.id}`)).toEqual(['company/details']);
    expect(recordIn(docs, 'company', 'details').phone).toBe('02 8650 2541');
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

  it('keeps a module\'s own records one document each, and tells the rules who is signed in (docs/adr/0011)', async () => {
    vi.useFakeTimers();
    const layout = documentLayout(builtInModules);
    const request = (no: string) => ({ no, purpose: 'Christmas party', amount: 48000, payee: 'V-002', settle: 'ASAP', requester: 'Ana Cruz', uid: 'hr-1', status: 'For Approval' });
    const filed = { ...sample(), ext: { funds: { requests: [request('RF-2026-0001')], last: 'RF-2026-0001' } } };
    const { remote, cloud } = memoryCloud(toDocuments(filed, layout));
    const who: Member = { uid: 'hr-1', name: 'Ana Cruz', role: 'staff' };
    const store = await KeystoneStore.open(cloudPlatform(localPlatform(null).platform, remote, layout, who));

    expect(layout).toEqual({ funds: expect.objectContaining({ collection: 'rf', readBy: 'uid' }) });
    expect(store.ctx.who).toEqual(who);
    expect(store.state).toEqual(filed);

    // A second request is written alone, with what the rules check beside it; the first is not written again.
    store.commit({ ...store.state, ext: { funds: { requests: [request('RF-2026-0001'), request('RF-2026-0002')], last: 'RF-2026-0002' } } });
    await vi.advanceTimersByTimeAsync(300);
    expect(cloud.writes[0].set.map((d) => [`${d.collection}/${d.id}`, d.fields])).toEqual([
      ['ext/funds', undefined],
      ['rf/RF-2026-0002', { status: 'For Approval', uid: 'hr-1' }],
    ]);
  });
});

describe('a save the cloud has not confirmed (docs/adr/0013)', () => {
  /** Keystone opened on this computer, noting the saves the cloud has not confirmed in `kept`. */
  async function opened(remote: RemoteDocs, kept: StoredText) {
    const platform = cloudPlatform(localPlatform(null).platform, remote, {}, undefined, kept);

    return { platform, state: parseState((await platform.loadState())!) };
  }

  /** The state with the vouchers' check numbers changed, from the first, and a log entry saying so. */
  const edited = (s: TerminalState, checks: string[], text = 'Checks renumbered.'): TerminalState => ({
    ...s,
    cv: s.cv.map((v, i) => (checks[i] ? { ...v, check: checks[i] } : v)),
    log: [{ when: '2026-11-11 09:30', mod: 'CV', text }, ...s.log],
  });

  it('writes a save the page closed on before the cloud had it, when Keystone opens again', async () => {
    const { remote, cloud, docs } = memoryCloud(toDocuments(sample()));
    const kept = memoryText();
    const before = await opened(remote, kept);
    const changed = { ...edited(before.state, ['000777']), dir: before.state.dir.slice(0, -1) };

    // The page reloads before Firestore has the write, so it never reaches the cloud.
    cloud.hold = true;
    void before.platform.saveState(JSON.stringify(changed));
    expect(kept.value).not.toBeNull();
    cloud.hold = false;

    const store = await KeystoneStore.open(cloudPlatform(localPlatform(null).platform, remote, {}, undefined, kept));

    expect(store.state).toEqual(changed);
    await vi.waitFor(() => expect(kept.value).toBeNull());
    expect(cloud.writes).toHaveLength(1);
    expect(recordIn(docs, 'cv', 'CV-2026-0139').check).toBe('000777');
    expect(recordIn(docs, 'dir', 'E-004')).toBeNull();
    expect(fromDocuments([...docs.values()])).toEqual(changed);
  });

  it('never writes it over a record another computer changed since, and writes the rest of it', async () => {
    const { remote, cloud, docs } = memoryCloud(toDocuments(sample()));
    const kept = memoryText();
    const mine = await opened(remote, kept);

    cloud.hold = true;
    void mine.platform.saveState(JSON.stringify(edited(mine.state, ['000777', '000778'], 'Mine.')));
    cloud.hold = false;

    // Before Keystone opens here again, another computer changes the first voucher.
    const other = await opened(remote, memoryText());

    await other.platform.saveState(JSON.stringify(edited(other.state, ['000999'], 'Theirs.')));

    const store = await KeystoneStore.open(cloudPlatform(localPlatform(null).platform, remote, {}, undefined, kept));

    expect(store.state.cv.map((v) => v.check)).toEqual(['000999', '000778', '0001188']);
    expect(store.state.log.map((e) => e.text).slice(0, 2).sort()).toEqual(['Mine.', 'Theirs.']);
    await vi.waitFor(() => expect(kept.value).toBeNull());
    expect(recordIn(docs, 'cv', 'CV-2026-0139').check).toBe('000999');
    expect(recordIn(docs, 'cv', 'CV-2026-0140').check).toBe('000778');
    expect(fromDocuments([...docs.values()])).toEqual(store.state);
  });

  it('does not write it again when it reached the cloud before the page closed', async () => {
    const { remote, cloud } = memoryCloud(toDocuments(sample()));
    const kept = memoryText();
    const before = await opened(remote, kept);
    const changed = edited(before.state, ['000777']);

    cloud.hold = true;
    void before.platform.saveState(JSON.stringify(changed));
    // The cloud has it, but the page closed before the cloud said so.
    cloud.held[0].land();
    cloud.hold = false;

    const store = await KeystoneStore.open(cloudPlatform(localPlatform(null).platform, remote, {}, undefined, kept));

    expect(store.state).toEqual(changed);
    expect(cloud.writes).toHaveLength(1);
    expect(kept.value).toBeNull();
  });

  it('writes a later save that was still waiting when the cloud confirmed an earlier one', async () => {
    const { remote, cloud, docs } = memoryCloud(toDocuments(sample()));
    const kept = memoryText();
    const before = await opened(remote, kept);
    const first = edited(before.state, ['000777'], 'First.');
    const second = edited(first, ['000778'], 'Second.');

    cloud.hold = true;
    const firstSaved = before.platform.saveState(JSON.stringify(first));

    void before.platform.saveState(JSON.stringify(second));
    // The first save reaches the cloud and is confirmed; the page closes before the second one is sent.
    cloud.held[0].land();
    cloud.held[0].confirm();
    await firstSaved;
    cloud.hold = false;

    const store = await KeystoneStore.open(cloudPlatform(localPlatform(null).platform, remote, {}, undefined, kept));

    expect(store.state).toEqual(second);
    await vi.waitFor(() => expect(kept.value).toBeNull());
    expect(fromDocuments([...docs.values()])).toEqual(second);
  });

  it('forgets each save the cloud confirms, and does not write one it refused when Keystone opens again', async () => {
    const { remote, cloud } = memoryCloud(toDocuments(sample()));
    const kept = memoryText();
    const before = await opened(remote, kept);

    await before.platform.saveState(JSON.stringify(edited(before.state, ['000777'])));
    expect(kept.value).toBeNull();

    cloud.failWrite = true;
    await expect(before.platform.saveState(JSON.stringify(edited(before.state, ['000778'], 'Refused.')))).rejects.toThrow('refused');
    expect(kept.value).toBeNull();
    cloud.failWrite = false;

    const store = await KeystoneStore.open(cloudPlatform(localPlatform(null).platform, remote, {}, undefined, kept));

    expect(store.state).toEqual(edited(sample(), ['000777']));
    expect(cloud.writes).toHaveLength(1);
  });

  it('opens as usual when the note on this computer cannot be read', async () => {
    const { remote, cloud } = memoryCloud(toDocuments(sample()));

    for (const damaged of ['{ not json', '[{"collection":"cv"}]', '{"cv":1}']) {
      const kept = memoryText(damaged);
      const store = await KeystoneStore.open(cloudPlatform(localPlatform(null).platform, remote, {}, undefined, kept));

      expect(store.state).toEqual(sample());
      expect(cloud.writes).toEqual([]);
      expect(kept.value).toBeNull();
    }
  });

  it('keeps each member\'s saves apart, and writes them when that member opens Keystone again', async () => {
    const { remote, cloud, docs } = memoryCloud(toDocuments(sample()));
    const ana: Member = { uid: 'hr-1', name: 'Ana Cruz', role: 'staff' };
    const mark: Member = { uid: 'ceo-1', name: 'Mark Reyes', role: 'owner' };
    const hers = cloudPlatform(localPlatform(null).platform, remote, {}, ana);
    const changed = edited(parseState((await hers.loadState())!), ['000777']);

    cloud.hold = true;
    void hers.saveState(JSON.stringify(changed));
    cloud.hold = false;
    expect(localStorage.getItem('keystone-pending-saves:hr-1')).not.toBeNull();

    // Someone else signs in on this computer: Ana's save is not written as theirs.
    const his = await KeystoneStore.open(cloudPlatform(localPlatform(null).platform, remote, {}, mark));

    expect(his.state).toEqual(sample());
    expect(cloud.writes).toEqual([]);

    // Ana signs in again, and it is written.
    const again = await KeystoneStore.open(cloudPlatform(localPlatform(null).platform, remote, {}, ana));

    expect(again.state).toEqual(changed);
    await vi.waitFor(() => expect(localStorage.getItem('keystone-pending-saves:hr-1')).toBeNull());
    expect(recordIn(docs, 'cv', 'CV-2026-0139').check).toBe('000777');
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

  it('talks to the emulators only for a demo project that names both', () => {
    const emulators = { VITE_FIREBASE_AUTH_EMULATOR: '127.0.0.1:9099', VITE_FIREBASE_FIRESTORE_EMULATOR: '127.0.0.1:8085' };

    expect(firebaseEmulators({ ...emulators, VITE_FIREBASE_PROJECT_ID: 'demo-keystone' })).toEqual({ auth: '127.0.0.1:9099', firestore: '127.0.0.1:8085' });
    expect(firebaseEmulators({ ...emulators, VITE_FIREBASE_PROJECT_ID: 'apg-keystone' })).toBeNull();
    expect(firebaseEmulators({ ...emulators })).toBeNull();
    expect(firebaseEmulators({ VITE_FIREBASE_PROJECT_ID: 'demo-keystone', VITE_FIREBASE_AUTH_EMULATOR: '127.0.0.1:9099' })).toBeNull();
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

  it('sends a link for a new password to the email typed, says the same whoever it belongs to, and goes back', async () => {
    const sendReset = vi.fn(async (email: string) => {
      if (email === 'busy@alphapremiergroup.com') throw new Error('Too many tries. Wait a few minutes, then try again.');
    });

    render(<SignIn signIn={vi.fn()} sendReset={sendReset} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'busy@alphapremiergroup.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));

    // The email typed so far comes along, and a refusal is said on the form.
    const form = screen.getByRole('form', { name: 'Forgot password' });
    expect(screen.getByLabelText('Email')).toHaveValue('busy@alphapremiergroup.com');
    fireEvent.click(screen.getByRole('button', { name: 'Send link' }));
    expect(await screen.findByText('Too many tries. Wait a few minutes, then try again.')).toBeInTheDocument();
    expect(form).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' ana.cruz@alphapremiergroup.com ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send link' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'If ana.cruz@alphapremiergroup.com has a Keystone account, a link to choose a new password is on its way to it.',
    );
    expect(sendReset).toHaveBeenLastCalledWith('ana.cruz@alphapremiergroup.com');

    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(screen.getByRole('form', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('ana.cruz@alphapremiergroup.com');
  });

  it('offers no Forgot password? without a way to send the link', () => {
    render(<SignIn signIn={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Forgot password?' })).toBeNull();
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
