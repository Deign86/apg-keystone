import { createRequire } from 'node:module';
import { zipSync } from 'fflate';
import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import type { ConnectorEnv, HttpResponse, InstalledApp, JsonValue, PlatformName, SystemBridge } from '@keystone/core';
import { ATTENDANCE_APP, attendanceConnector, attendanceFigures, attendanceInstallerFor, isLate, kioskBase } from '../src';
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

describe('the attendance app on this computer', () => {
  const RELEASE = {
    tag_name: 'v0.2.29', html_url: 'https://github.com/Deign86/alpha-premier-attendance/releases/tag/v0.2.29',
    assets: [
      { name: 'Alpha Premier Attendance_0.2.29_x64-setup.exe', browser_download_url: 'https://x/setup.exe' },
      { name: 'Alpha Premier Attendance_0.2.29_aarch64.dmg', browser_download_url: 'https://x/arm.dmg' },
      { name: 'Alpha Premier Attendance_0.2.29_x64.dmg', browser_download_url: 'https://x/intel.dmg' },
      { name: 'latest.json', browser_download_url: 'https://x/latest.json' },
    ],
  };

  /** A computer with the attendance app at `version` (or none), GitHub answering, and a kiosk at `address` if set. */
  function machine(options: { platform?: PlatformName; version?: string | null; address?: string; github?: boolean }) {
    const { platform = 'macos', version = '0.2.29', address = '', github = true } = options;
    const app: InstalledApp | null = version === null ? null : { path: '/Applications/Alpha Premier Attendance.app', version };
    const located: unknown[] = [];
    const launched: InstalledApp[] = [];
    const opened: string[] = [];
    const calls = { located, launched, opened };

    const env: ConnectorEnv = {
      settings: { address }, secret: async () => null, now: () => new Date(),
      system: {
        ...system, platform,
        locateApp: async (l) => { calls.located.push(l);

 return app; },
        launchApp: async (a) => { calls.launched.push(a); },
        openUrl: async (u) => { calls.opened.push(u); },
      },
      http: {
        native: true,
        request: async (url) => {
          if (url.startsWith('https://api.github.com/')) {
            if (!github) throw new Error('offline');

            return response(200, RELEASE);
          }

          return response(200, { lan: { connectedSseClients: 1 } });
        },
      },
    };

    return { env, calls };
  }

  it('looks for it by the attendance app’s own bundle id and Windows uninstall key', async () => {
    const { env, calls } = machine({});
    await attendanceConnector.health(env);

    expect(calls.located).toEqual([ATTENDANCE_APP]);
    expect(ATTENDANCE_APP).toEqual({
      macBundleId: 'com.alphapremier.attendance', macAppName: 'Alpha Premier Attendance',
      windowsUninstallKey: 'Alpha Premier Attendance', windowsExe: 'alpha-premier-attendance.exe',
    });
  });

  it('is connected when installed here, up to date or with the update offered', async () => {
    expect(await attendanceConnector.health(machine({}).env)).toEqual({
      state: 'ready', version: '0.2.29',
      detail: 'Version 0.2.29 on this computer, up to date; add the kiosk’s LAN address in Settings for live figures.',
    });

    const behind = await attendanceConnector.health(machine({ version: '0.2.28', platform: 'windows' }).env);

    expect(behind.state).toBe('ready');
    expect(behind.detail).toBe('Version 0.2.28 on this computer; 0.2.29 is out; add the kiosk’s LAN address in Settings for live figures.');
    expect(behind.update).toEqual({ version: '0.2.29', url: 'https://x/setup.exe' });
  });

  it('asks to be set up, and offers the download, when it is not installed', async () => {
    const health = await attendanceConnector.health(machine({ version: null }).env);

    expect(health.state).toBe('setup');
    expect(health.detail).toMatch(/or install the attendance app on this computer \(version 0\.2\.29\)/);
    expect(health.update).toEqual({ version: '0.2.29', url: RELEASE.html_url });
  });

  it('keeps the kiosk’s own state when an address is set, and adds the installed version', async () => {
    const health = await attendanceConnector.health(machine({ address: '192.168.1.50' }).env);

    expect(health).toEqual({ state: 'ready', version: '0.2.29', detail: 'Kiosk online at 192.168.1.50:4173 · 1 live viewer.' });
  });

  it('still works when GitHub cannot be reached', async () => {
    expect((await attendanceConnector.health(machine({ github: false }).env)).detail).toMatch(/^Version 0\.2\.29 on this computer, up to date/);
  });

  it('does not look for the app or GitHub in the browser preview', async () => {
    const { env, calls } = machine({ platform: 'web' });

    expect(await attendanceConnector.health(env)).toEqual({ state: 'setup', detail: 'Enter the kiosk’s address to see today’s attendance here.' });
    expect(calls.located).toEqual([]);
  });

  it('opens the installed app, and says how to get it when it is missing', async () => {
    const open = attendanceConnector.actions!.find((a) => a.id === 'open')!;
    const installed = machine({});

    expect(await open.run(installed.env)).toBe('Opened Alpha Premier Attendance.');
    expect(installed.calls.launched).toEqual([{ path: '/Applications/Alpha Premier Attendance.app', version: '0.2.29' }]);
    await expect(open.run(machine({ version: null }).env)).rejects.toThrow('not installed on this computer');
    await expect(open.run(machine({ platform: 'web' }).env)).rejects.toThrow('desktop app');
  });

  it('downloads the Windows installer, and opens the release page on a Mac to choose the chip', async () => {
    const download = attendanceConnector.actions!.find((a) => a.id === 'download')!;
    const windows = machine({ platform: 'windows' });
    const mac = machine({ platform: 'macos' });

    expect(await download.run(windows.env)).toBe('Downloading the attendance app v0.2.29.');
    expect(windows.calls.opened).toEqual(['https://x/setup.exe']);
    expect(await download.run(mac.env)).toMatch(/aarch64 \.dmg for Apple silicon/);
    expect(mac.calls.opened).toEqual([RELEASE.html_url]);
    expect(attendanceInstallerFor({ ...RELEASE, assets: [] }, 'windows')).toBe(RELEASE.html_url);
  });
});

function response(status: number, body: JsonValue): HttpResponse {
  // SAFETY: a fake server. Each test hands it the body the code under test expects as T.
  return { status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(body), json: async <T,>() => body as T, bytes: async () => new Uint8Array() };
}
