import { describe, expect, it, vi } from 'vitest';
import { sampleState } from '@keystone/core/sample';
import { KeystoneStore } from '../src/store';
import { memoryPlatform } from '../testing';

// Live updates (Platform.watchState): what others save shows here as it is saved, and a change made here and not
// saved yet is kept on top of it.

/** A platform whose saved state others can change: `push` stands in for their save. */
function shared() {
  const { platform, files } = memoryPlatform(JSON.stringify(sampleState()));
  let listener: ((json: string) => void) | undefined;
  const stop = vi.fn();

  platform.watchState = (onChange) => {
    listener = onChange;

    return stop;
  };

  return { platform, files, stop, push: (json: string) => listener?.(json) };
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
