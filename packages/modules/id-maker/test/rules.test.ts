import { describe, expect, it } from 'vitest';
import { bundledSeed, usedBy, type Ctx } from '@keystone/core';
import { idFigure, idFinding, issueID, markExpired, newID, nextIDNo, withEmployee } from '../src/rules';
import { verificationCells } from '../src/verification';

/** 30 Oct 2026, 09:05 in Manila. */
const ctx: Ctx = { seed: bundledSeed, now: () => new Date(2026, 9, 30, 9, 5) };
const state = () => structuredClone(bundledSeed.state);

describe('ID maker', () => {
  it('issues an ID from the directory', () => {
    const s = state();
    expect(nextIDNo(s, ctx)).toBe('APG-2026-0031');
    const d = withEmployee(s, newID(s, ctx), 'E-004');
    expect(d.valid).toBe('2027-10-29');
    expect(d.pos).toBe('Admin Assistant');
    const r = issueID(s, d, ctx);
    expect(r.message).toBe('APG-2026-0031 issued and queued for printing.');
    expect(usedBy(r.state, 'E-004')).toEqual(['ID']);
  });

  it('expires cards on open', () => {
    const expired = markExpired(state(), { ...ctx, now: () => new Date(2027, 8, 5) });
    expect(expired.ids.filter((i) => i.status === 'Expired').map((i) => i.no)).toEqual(['APG-2026-0028']);
  });

  it('contributes its figure and finding', () => {
    expect(idFigure(state(), ctx).value).toBe('1');
    expect(idFinding(state())).toEqual({ priority: 10, text: '1 ID is waiting to be printed.' });
  });

  it('draws the verification pattern exactly like the prototype', () => {
    const rows = verificationCells('APG-2026-0028|Juan Miguel P. Reyes').map((r) => r.map((c) => (c ? '1' : '0')).join(''));
    expect(rows).toEqual([
      '111111101101101111111', '100000100000001000001', '101110100110001011101', '101110100101101011101',
      '101110101100001011101', '100000101000001000001', '111111100100001111111', '000000000110100000000',
      '111100010001001010010', '010101001010000010010', '001110010010000011001', '110010010101111011000',
      '000111100111010001011', '000000001011010011011', '111111100000111100100', '100000101100001000010',
      '101110101001000000000', '101110101001111111001', '101110100101111110000', '100000100001010000101',
      '111111100100010011010',
    ]);
  });
});
