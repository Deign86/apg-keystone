import { describe, expect, it } from 'vitest';
import { bundledSeed, type Ctx } from '@keystone/core';
import { directoryModule } from '../src';

const ctx: Ctx = { seed: bundledSeed, now: () => new Date(2026, 9, 30, 9, 5) };
const state = () => structuredClone(bundledSeed.state);

describe('directory', () => {
  it('contributes its figure and its home stat', () => {
    expect(directoryModule.figure!(state(), ctx)).toEqual({ label: 'Directory records', value: '11', caption: '4 vendors · 3 clients · 4 employees' });
    expect(directoryModule.stat!(state(), ctx)).toEqual(['Records', '11']);
  });

  it('counts what is there, not what the sample had', () => {
    const s = { ...state(), dir: state().dir.filter((r) => r.type !== 'Vendor') };
    expect(directoryModule.figure!(s, ctx)).toMatchObject({ value: '7', caption: '0 vendors · 3 clients · 4 employees' });
  });
});
