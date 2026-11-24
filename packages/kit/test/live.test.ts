import { describe, expect, it, vi } from 'vitest';
import { logged, type Ctx, type LogEntry, type Member } from '@keystone/core';
import { sampleState } from '@keystone/core/sample';
import { KeystoneStore } from '../src/store';
import { memoryPlatform } from '../testing';

// Live updates (Platform.watchState, docs/adr/0047): what others save shows here as it is saved, a change made here and
// not saved yet is kept on top of it, nothing that arrives is ever written back, and the lines others' saves add to the
// Activity Log are told.

const ana: Member = { uid: 'hr-1', name: 'Ana Cruz', role: 'staff' };
const mark: Member = { uid: 'ceo-1', name: 'Mark Reyes', role: 'owner' };
const at = (who: Member): Ctx => ({ now: () => new Date(2026, 10, 2, 10, 0), who });

/** A platform whose saved state others can change: `push` stands in for their save, `live` for the listeners' state. */
function shared() {
  const { platform, files } = memoryPlatform(JSON.stringify(sampleState()));
  let listener: ((json: string) => void) | undefined;
  let onLive: ((live: boolean) => void) | undefined;
  const stop = vi.fn();
  const save = vi.spyOn(platform, 'saveState');

  platform.watchState = (onChange, live) => {
    listener = onChange;
    onLive = live;

    return stop;
  };

  return { platform, files, stop, save, push: (json: string) => listener?.(json), live: (on: boolean) => onLive?.(on) };
}

/** The sample records after Ana saved a voucher on her computer: the voucher, and its Activity Log line naming her. */
function anaSaved(no = '888-012') {
  const theirs = sampleState();
  const voucher = { ...theirs.cv[0], no, status: 'For Approval' };

  return logged({ ...theirs, cv: [...theirs.cv, voucher] }, 'CV', `${no} for MERALCO routed for approval (₱980.00).`, at(ana));
}

describe('live updates', () => {
  it('shows what someone else saved at once, and writes nothing back', async () => {
    const cloud = shared();
    const store = await KeystoneStore.open(cloud.platform);
    const seen = vi.fn();

    store.subscribe(seen);
    const theirs = sampleState();

    theirs.cv = theirs.cv.filter((v) => v.no !== 'CV-2026-0140');
    cloud.push(JSON.stringify(theirs));

    expect(store.state.cv.map((v) => v.no)).toEqual(['CV-2026-0139', 'CV-2026-0141']);
    expect(seen).toHaveBeenCalledTimes(1);
    await store.flush();
    expect(cloud.files.writes).toBe(0);
    // The same state again changes nothing on screen.
    cloud.push(JSON.stringify(theirs));
    expect(seen).toHaveBeenCalledTimes(1);
    store.close();
    expect(cloud.stop).toHaveBeenCalled();
  });

  it('never saves because something arrived, however often it arrives and however long it waits', async () => {
    vi.useFakeTimers();

    try {
      const cloud = shared();
      const store = await KeystoneStore.open(cloud.platform);

      for (let i = 1; i <= 5; i += 1) cloud.push(JSON.stringify(anaSaved(`888-01${i}`)));
      await vi.advanceTimersByTimeAsync(10_000);
      await store.flush();

      expect(store.state.cv.map((v) => v.no)).toContain('888-015');
      expect(cloud.save).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a change made here and not saved yet on top of theirs, and saves both', async () => {
    const cloud = shared();
    const store = await KeystoneStore.open(cloud.platform);

    // Here: a directory record renamed, waiting out the save's short delay.
    store.commit({ ...store.state, dir: store.state.dir.map((d) => (d.code === 'V-002' ? { ...d, name: 'Maynilad' } : d)) });
    // Meanwhile someone else deletes a voucher.
    const theirs = sampleState();

    theirs.cv = theirs.cv.filter((v) => v.no !== 'CV-2026-0140');
    cloud.push(JSON.stringify(theirs));

    expect(store.state.cv.map((v) => v.no)).toEqual(['CV-2026-0139', 'CV-2026-0141']);
    expect(store.state.dir.find((d) => d.code === 'V-002')?.name).toBe('Maynilad');
    await store.flush();
    const saved = JSON.parse(cloud.files.state ?? '{}');

    expect(saved.cv.map((v: { no: string }) => v.no)).toEqual(['CV-2026-0139', 'CV-2026-0141']);
    expect(saved.dir.find((d: { code: string }) => d.code === 'V-002').name).toBe('Maynilad');
    // Only this computer's change was written, once.
    expect(cloud.save).toHaveBeenCalledTimes(1);
  });

  it('passes over a state that does not read', async () => {
    const cloud = shared();
    const store = await KeystoneStore.open(cloud.platform);
    const before = store.state;

    vi.spyOn(console, 'warn').mockImplementation(() => {});
    cloud.push('not json');
    expect(store.state).toBe(before);
  });
});

describe('what arrived from elsewhere', () => {
  it('is told: the Activity Log lines of others\' saves, never one made here, saved or not', async () => {
    const cloud = shared();
    const store = await KeystoneStore.open(cloud.platform);
    const told: LogEntry[][] = [];

    store.onArrival((entries) => told.push(entries));
    // Mark logs a change here, not saved yet; Ana's save arrives without it.
    store.run((s) => ({ state: logged(s, 'DIR', 'V-002 renamed.', at(mark)), record: null, message: '' }));
    cloud.push(JSON.stringify(anaSaved()));

    expect(told).toEqual([[{ when: '2026-11-02 10:00', mod: 'CV', text: '888-012 for MERALCO routed for approval (₱980.00).', by: 'Ana Cruz' }]]);
    expect(store.state.log.map((e) => e.text).slice(0, 2)).toEqual(['V-002 renamed.', '888-012 for MERALCO routed for approval (₱980.00).']);

    // Mark's save comes back from the cloud with Ana's: nothing new.
    await store.flush();
    cloud.push(JSON.stringify(store.state));
    expect(told).toHaveLength(1);
  });

  it('marks the state as changed elsewhere, until a change is made here', async () => {
    const cloud = shared();
    const store = await KeystoneStore.open(cloud.platform);

    expect(store.lastChange).toBe('here');
    cloud.push(JSON.stringify(anaSaved()));
    expect(store.lastChange).toBe('elsewhere');
    store.commit({ ...store.state, ext: { a: 1 } });
    expect(store.lastChange).toBe('here');
  });

  it('stops being told once the listener stops listening', async () => {
    const cloud = shared();
    const store = await KeystoneStore.open(cloud.platform);
    const told = vi.fn();
    const stop = store.onArrival(told);

    stop();
    cloud.push(JSON.stringify(anaSaved()));
    expect(told).not.toHaveBeenCalled();
  });
});

describe('whether live updates run', () => {
  it('follows the platform, and tells the screens each time it changes', async () => {
    const cloud = shared();
    const store = await KeystoneStore.open(cloud.platform);
    const seen = vi.fn();

    store.subscribe(seen);
    expect(store.live).toBe(true);
    cloud.live(false);
    expect(store.live).toBe(false);
    cloud.live(false);
    expect(seen).toHaveBeenCalledTimes(1);
    cloud.live(true);
    expect(store.live).toBe(true);
    expect(seen).toHaveBeenCalledTimes(2);
  });
});
