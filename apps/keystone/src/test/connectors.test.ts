import { createRequire } from 'node:module';
import { zipSync } from 'fflate';
import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import type { Connector, ConnectorEnv, HttpResponse } from '@keystone/core';
import { buildRegistry } from '../app/registry';
import { Connections } from '../app/connections';
import { attendanceConnector, attendanceFigures, isLate, kioskBase } from '../connectors/attendance';
import { readAttendanceBackup } from '../connectors/attendance/backup';
import { installerFor, isNewer } from '../connectors/branding-studio';
import { imageType, paymentAmount, siteBase } from '../connectors/website/api';
import { browserPlatform } from '../platform/browser';
import type { Platform } from '../platform';

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
      settings: { address }, secret: async () => null, now: () => new Date(), system: browserPlatform,
      http: { native: true, request: async () => { if (status === 'down') throw new Error('ECONNREFUSED'); return response(status, { lan: { connectedSseClients: 2 } }); } },
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

describe('branding studio connector', () => {
  it('compares versions the way the installer writes them', () => {
    expect(isNewer('v2.6.0', '2.5.0.0')).toBe(true);
    expect(isNewer('v2.5.0', '2.5.0.0')).toBe(false);
    expect(isNewer('v2.5.0', '2.10.0')).toBe(false);
  });

  it('picks the installer for this platform', () => {
    const release = {
      tag_name: 'v2.5.0', html_url: 'https://github.com/Deign86/Alpha_Branding/releases/tag/v2.5.0',
      assets: [
        { name: 'Alpha.Branding.Setup.exe', browser_download_url: 'https://x/setup.exe' },
        { name: 'Alpha.Branding-v2.5.0-macos.pkg', browser_download_url: 'https://x/mac.pkg' },
      ],
    };
    expect(installerFor(release, 'windows')).toBe('https://x/setup.exe');
    expect(installerFor(release, 'macos')).toBe('https://x/mac.pkg');
    expect(installerFor(release, 'linux')).toBe(release.html_url);
  });
});

describe('website connector', () => {
  it('reads what the Pay page sends', () => {
    const p = { meta: { amount: '₱4,999.00' } } as Parameters<typeof paymentAmount>[0];
    expect(paymentAmount(p)).toBe(4999);
    expect(paymentAmount({ meta: null } as Parameters<typeof paymentAmount>[0])).toBeNull();
    expect(siteBase('alphapremiergroup.com/')).toBe('https://alphapremiergroup.com');
    expect(imageType(new Uint8Array([0xff, 0xd8, 0xff]))).toBe('image/jpeg');
    expect(imageType(new Uint8Array([0x89, 0x50, 0x4e]))).toBe('image/png');
  });
});

describe('modularity', () => {
  const ok = (id: string): Connector => ({ id, name: id, about: '', platforms: ['web'], settings: [], health: async () => ({ state: 'ready', detail: 'fine' }) });
  const Screen = () => null;

  it('refuses a broken plugin and keeps the rest', () => {
    const r = buildRegistry([{ id: 'home', title: 'Home', section: '', blurb: '', order: 0, Screen }], [
      { connector: ok('payroll'), modules: [{ id: 'payroll', title: 'Payroll', section: '', blurb: '', order: 8, Screen }] },
      { connector: ok('payroll') },
      { connector: { ...ok('Bad Id') } },
      { connector: ok('lease'), modules: [{ id: 'home', title: 'Duplicate', section: '', blurb: '', order: 9, Screen }] },
    ]);
    expect(r.connectors.map((c) => c.id)).toEqual(['payroll', 'lease']);
    expect(r.modules.map((m) => m.id)).toEqual(['home', 'payroll']);
    expect(r.refused.map((x) => x.id)).toEqual(['payroll', 'Bad Id', 'home']);
  });

  it('isolates a connector that throws or hangs', async () => {
    const platform: Platform = { ...browserPlatform, loadSettings: async () => ({}) };
    const crashing: Connector = { ...ok('crashing'), health: async () => { throw new Error('boom'); } };
    const hanging: Connector = { ...ok('hanging'), health: () => new Promise(() => {}) };
    const fine = ok('fine');
    const c = new Connections(platform, [crashing, hanging, fine]);
    await Promise.all([c.refresh(crashing), c.refresh(fine)]);
    expect(c.statusOf('crashing').health).toEqual({ state: 'offline', detail: 'boom' });
    expect(c.statusOf('fine').health?.state).toBe('ready');
    const slow = c.safely(hanging, 'health', (env) => hanging.health(env), 30);
    await expect(slow).rejects.toThrow('did not answer');
  });
});
