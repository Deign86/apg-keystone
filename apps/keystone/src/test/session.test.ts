import { describe, expect, it } from 'vitest';
import { cloudSession, IDLE_MS, unusedTooLong, type UseLog } from '../platform/session';

// The cloud build's session (docs/adr/0012): when Keystone was last used on this computer, and whether opening it now
// asks for the account again.

function memoryLog(value: string | null = null): UseLog & { value: string | null } {
  const log = {
    value,
    get: () => log.value,
    set: (v: string | null) => { log.value = v; },
  };

  return log;
}

const NOW = Date.parse('2026-11-02T10:00:00+08:00');

describe('signing out when Keystone sat unused', () => {
  it('signs out after 10 minutes', () => {
    expect(IDLE_MS).toBe(10 * 60 * 1000);
  });

  it('asks again only when Keystone was last used here 10 minutes ago or more', () => {
    expect(unusedTooLong(memoryLog(String(NOW - IDLE_MS)), NOW)).toBe(true);
    expect(unusedTooLong(memoryLog(String(NOW - 3 * 24 * 60 * 60 * 1000)), NOW)).toBe(true);
    expect(unusedTooLong(memoryLog(String(NOW - IDLE_MS + 1)), NOW)).toBe(false);
  });

  it('never used here, or a time that cannot be read: asks nothing', () => {
    expect(unusedTooLong(memoryLog(null), NOW)).toBe(false);
    expect(unusedTooLong(memoryLog('yesterday'), NOW)).toBe(false);
  });

  it('notes each use, and forgets it on signing out, so the next sign-in starts fresh', async () => {
    const log = memoryLog();
    const order: string[] = [];
    const session = cloudSession(async () => { order.push(`signed out, last use ${String(log.value)}`); }, log);

    session.used(NOW);
    expect(log.value).toBe(String(NOW));

    await session.signOut();
    expect(order).toEqual(['signed out, last use null']);
  });
});
