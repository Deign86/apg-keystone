import { createRequire } from 'node:module';
import { zipSync } from 'fflate';
import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import type { ConnectorEnv, HttpResponse, SystemBridge } from '@keystone/core';
import { attendanceConnector, attendanceFigures, isLate, kioskBase } from '../src';
import { readAttendanceBackup } from '../src/backup';

const system: SystemBridge = {
  platform: 'macos', locateApp: async () => null, launchApp: async () => {}, openUrl: async () => {},
  pickFiles: async () => [], readFile: async () => new Uint8Array(), listFiles: async () => [], appDataFolder: async () => null,
};

const require = createRequire(import.meta.url);
const loadSql = () => initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });

/** A backup laid out exactly as alpha-premier-attendance's create_portable_backup writes it. */
async function fakeBackup() {
  const SQL = await loadSql();
  const db = new SQL.Database();
  // The users table after the attendance app's migrations 0001, 0007, 0009 and 0011.
  db.run(`CREATE TABLE users (user_id TEXT PRIMARY KEY, rfid_uid TEXT NOT NULL UNIQUE, full_name TEXT NOT NULL, department TEXT,
    status TEXT NOT NULL, created_at TEXT NOT NULL, employee_type TEXT NOT NULL DEFAULT 'INTERN', daily_rate_centavos INTEGER,
    payroll_profile_id TEXT, photo_url TEXT, revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, gender TEXT,
    tin TEXT, bank_name TEXT NOT NULL DEFAULT 'CASH', account_number TEXT NOT NULL DEFAULT '0000', designation TEXT,
    card_type TEXT NOT NULL DEFAULT 'EMPLOYEE')`);

  const add = (id: string, name: string, dept: string | null, status: string, card: string, designation: string | null = null) =>
    db.run('INSERT INTO users (user_id, rfid_uid, full_name, department, status, created_at, updated_at, card_type, designation) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, `00${id.length}${name.length}`, name, dept, status, '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z', card, designation]);

  add('APG-2026-102', 'Rafael D. Mendoza', 'Property Management', 'ACTIVE', 'EMPLOYEE', 'Property Manager');
  add('APG-2026-103', 'Bea Santos', 'Leasing', 'ACTIVE', 'EMPLOYEE');
  add('APG-2026-104', 'Left Already', 'Leasing', 'INACTIVE', 'EMPLOYEE');
  add('ADMIN_CARD_0001', 'Front Desk Admin', 'Admin', 'ACTIVE', 'ADMIN_ASSIST');
  const dbBytes = db.export();
  db.close();
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]);

  return zipSync({
    'manifest.json': new TextEncoder().encode(JSON.stringify({ format: 'alpha-premier-application-backup', version: 1, database: 'database/attendance.db' })),
    'database/attendance.db': dbBytes,
    'photos/APG-2026-102.webp': webp,
    'photos/APG-2026-104.webp': webp,
    'attendance.db': new Uint8Array([1]),
  });
}

describe('attendance connector', () => {
  it('normalises the kiosk address', () => {
    expect(kioskBase('192.168.1.50')).toBe('http://192.168.1.50:4173');
    expect(kioskBase('192.168.1.50:8080/')).toBe('http://192.168.1.50:8080');
    expect(kioskBase('http://frontdesk.local:4173/attendance')).toBe('http://frontdesk.local:4173');
    expect(kioskBase('  ')).toBeNull();
  });

  it('applies the attendance app’s lateness rule', () => {
    expect(isLate('2026-10-30T08:00:59+08:00', '2026-10-30')).toBe(false);
    expect(isLate('2026-10-30T08:01:00+08:00', '2026-10-30')).toBe(true);
    expect(isLate('2026-09-15T08:10:00+08:00', '2026-09-15')).toBe(false); // weekly grace before October
    expect(isLate(null, '2026-10-30')).toBe(false);
  });

  it('turns today’s rows into home-screen figures', () => {
    const rows = [
      { attendanceId: 'a', userId: '1', fullName: 'Alex Rivera', department: null, timeIn: '2026-10-30T08:57:00+08:00', timeOut: null, status: 'WORKING' },
      { attendanceId: 'b', userId: '2', fullName: 'Sam Santos', department: null, timeIn: '2026-10-30T07:55:00+08:00', timeOut: '2026-10-30T18:20:00+08:00', status: 'LATE_TIMEOUT' },
      { attendanceId: 'c', userId: '3', fullName: 'Jamie Cruz', department: null, timeIn: '2026-10-30T07:40:00+08:00', timeOut: '2026-10-30T17:00:00+08:00', status: 'COMPLETED' },
    ];

    expect(attendanceFigures(rows, '2026-10-30')).toEqual([
      { label: 'In now', value: '1', caption: '3 scans today' },
      { label: 'Late arrivals', value: '1', caption: 'Alex' },
      { label: 'Timed out', value: '2', caption: '1 after 6:00 PM' },
    ]);
  });

  it('reads employees and photos from a real attendance backup', async () => {
    const got = await readAttendanceBackup(await fakeBackup(), loadSql);
    expect(got.people).toEqual([
      { externalId: 'APG-2026-103', name: 'Bea Santos', department: 'Leasing' },
      { externalId: 'APG-2026-102', name: 'Rafael D. Mendoza', position: 'Property Manager', department: 'Property Management' },
    ]);
    expect(got.skipped).toBe(2);
    expect(got.photos.map((p) => [p.externalId, p.type])).toEqual([['APG-2026-102', 'image/webp']]);
  });

  it('refuses files that are not attendance backups', async () => {
    await expect(readAttendanceBackup(new Uint8Array([1, 2, 3]), loadSql)).rejects.toThrow('not a ZIP archive');
    await expect(readAttendanceBackup(zipSync({ 'a.txt': new Uint8Array([1]) }), loadSql)).rejects.toThrow('no Alpha Premier manifest');
  });

  it('reports a kiosk that is not configured, refusing, or down', async () => {
    const env = (status: number | 'down', address = '192.168.1.50'): ConnectorEnv => ({
      settings: { address }, secret: async () => null, now: () => new Date(), system,
      http: {
        native: true,
        request: async () => {
          if (status === 'down') throw new Error('ECONNREFUSED');

          return response(status, { lan: { connectedSseClients: 2 } });
        },
      },
    });

    expect((await attendanceConnector.health(env(200, ''))).state).toBe('setup');
    expect(await attendanceConnector.health(env(200))).toEqual({ state: 'ready', detail: 'Kiosk online at 192.168.1.50:4173 · 2 live viewers.' });
    expect((await attendanceConnector.health(env(401))).state).toBe('setup');
    expect((await attendanceConnector.health(env(403))).detail).toMatch(/allowed_subnets/);
    expect((await attendanceConnector.health(env('down'))).state).toBe('offline');
  });
});

function response(status: number, body: unknown): HttpResponse {
  return { status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(body), json: async <T,>() => body as T, bytes: async () => new Uint8Array() };
}
