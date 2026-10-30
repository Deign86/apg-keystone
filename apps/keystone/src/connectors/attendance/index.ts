import { count, type Connector, type ConnectorEnv, type Figure } from '@keystone/core';
import type { ConnectorPlugin } from '../../app/registry';
import { loadSql } from '../../lib/sql';
import { readAttendanceBackup } from './backup';

// Alpha Premier Attendance (alpha-premier-attendance): the RFID kiosk at the front desk.
//
// What Keystone uses, all of it already in the attendance app:
// - its read-only LAN viewer on port 4173 (src-tauri/src/lan_server.rs):
//   GET /api/health, GET /api/attendance/today?date=, the /attendance dashboard,
//   with the optional viewer token in X-Viewer-Token;
// - its portable backup (.apbackup), written on every clean exit to
//   <LocalAppData>/com.alphapremier.attendance/backups, for the employee list and photos.
// The LAN viewer deliberately never serves the roster or photos (docs/lan-dashboard-deployment.md),
// which is why the people come from the backup.

const IDENTIFIER = 'com.alphapremier.attendance';
const DEFAULT_PORT = 4173;

/** "192.168.1.50", "192.168.1.50:4173" or a full URL -> "http://192.168.1.50:4173". */
export function kioskBase(address: string): string | null {
  const a = address.trim().replace(/\/+$/, '');
  if (!a) return null;
  const withScheme = /^https?:\/\//i.test(a) ? a : `http://${a}`;
  try {
    const u = new URL(withScheme);
    return `${u.protocol}//${u.hostname}:${u.port || DEFAULT_PORT}`;
  } catch {
    return null;
  }
}

export interface AttendanceRow {
  attendanceId: string;
  userId: string;
  fullName: string;
  department: string | null;
  timeIn: string | null;
  timeOut: string | null;
  status: 'WORKING' | 'COMPLETED' | 'LATE_TIMEOUT' | 'MISSED' | string;
}

/**
 * Late, by the attendance app's own rule (shared/src/api-contracts.ts): from 1 Oct 2026 a
 * Manila time-in at or after 08:01:00 is late; before that, a weekly grace ran to 08:15.
 * Times arrive as Manila RFC 3339 ("2026-10-30T08:05:12+08:00").
 */
export function isLate(timeIn: string | null, date: string): boolean {
  if (!timeIn) return false;
  const hhmm = timeIn.slice(11, 16);
  return date >= '2026-10-01' ? hhmm >= '08:01' : hhmm > '08:15';
}

export function attendanceFigures(rows: AttendanceRow[], date: string): Figure[] {
  const working = rows.filter((r) => r.status === 'WORKING');
  const out = rows.filter((r) => r.status === 'COMPLETED' || r.status === 'LATE_TIMEOUT');
  const late = rows.filter((r) => isLate(r.timeIn, date));
  return [
    { label: 'In now', value: String(working.length), caption: `${count(rows.length, 'scan')} today` },
    { label: 'Late arrivals', value: String(late.length), caption: late.length ? late.slice(0, 3).map((r) => r.fullName.split(' ')[0]).join(', ') + (late.length > 3 ? '…' : '') : 'Everyone on time' },
    { label: 'Timed out', value: String(out.length), caption: `${rows.filter((r) => r.status === 'LATE_TIMEOUT').length} after 6:00 PM` },
  ];
}

async function kiosk(env: ConnectorEnv) {
  const base = kioskBase(env.settings.address);
  const token = await env.secret('token');
  const headers: Record<string, string> = token ? { 'X-Viewer-Token': token } : {};
  return { base, headers, token };
}

async function newestBackup(env: ConnectorEnv): Promise<string | null> {
  const folders = [env.settings.backupFolder?.trim()].filter(Boolean) as string[];
  const local = await env.system.appDataFolder(IDENTIFIER);
  if (local) folders.push(`${local}${local.includes('\\') ? '\\' : '/'}backups`);
  for (const f of folders) {
    const found = (await env.system.listFiles(f)).filter((x) => x.path.toLowerCase().endsWith('.apbackup'));
    if (found.length) return found[0].path;
  }
  return null;
}

export const attendanceConnector: Connector = {
  id: 'attendance',
  name: 'Attendance Tracker',
  about: 'The RFID time-in kiosk at the front desk, with payroll PDFs and the bathroom key log.',
  platforms: ['windows', 'macos', 'linux', 'web'],
  refreshSeconds: 30,
  settings: [
    { key: 'address', label: 'Kiosk address', kind: 'text', placeholder: '192.168.1.50:4173', help: 'The address shown in the attendance app under Live attendance › Share on the LAN. Port 4173 is assumed when you leave it out.' },
    { key: 'token', label: 'Viewer token', kind: 'secret', help: 'Only when the kiosk’s LAN viewer uses a password (auth_mode = "password" in its config.toml).' },
    { key: 'backupFolder', label: 'Backup folder', kind: 'text', placeholder: '\\\\FRONTDESK\\attendance-backups', help: 'Where to find the attendance backups when Keystone runs on a different PC. On the kiosk PC itself, leave this empty.' },
  ],

  async health(env) {
    const { base, headers } = await kiosk(env);
    if (!base) return { state: 'setup', detail: 'Enter the kiosk’s address to see today’s attendance here.' };
    let r;
    try {
      r = await env.http.request(`${base}/api/health`, { headers, timeoutMs: 5000 });
    } catch {
      return { state: 'offline', detail: env.http.native ? `No answer from the kiosk at ${base}. Is the attendance app open, and is its LAN viewer on?` : 'Open Keystone’s desktop app to reach the kiosk; the browser preview cannot.' };
    }
    if (r.status === 401) return { state: 'setup', detail: 'The kiosk asks for its viewer token. Add it in the settings.' };
    if (r.status === 403) return { state: 'error', detail: 'The kiosk refused this computer’s address. Add its subnet to allowed_subnets in the kiosk’s config.toml.' };
    if (!r.ok) return { state: 'error', detail: `The kiosk answered ${r.status}.` };
    const h = await r.json<{ lan?: { connectedSseClients?: number } }>();
    const viewers = h.lan?.connectedSseClients ?? 0;
    return { state: 'ready', detail: `Kiosk online at ${base.replace('http://', '')} · ${count(viewers, 'live viewer')}.` };
  },

  async figures(env) {
    const { base, headers } = await kiosk(env);
    if (!base) return [];
    const r = await env.http.request(`${base}/api/attendance/today`, { headers, timeoutMs: 5000 });
    if (!r.ok) throw new Error(`The kiosk answered ${r.status}.`);
    const body = await r.json<{ date: string; attendance: AttendanceRow[] }>();
    return attendanceFigures(body.attendance ?? [], body.date);
  },

  people: {
    label: 'Import employees from the attendance backup',
    async fetch(env) {
      let path = await newestBackup(env);
      if (!path) {
        const picked = await env.system.pickFiles('Choose an attendance backup', [{ name: 'Attendance backup', extensions: ['apbackup', 'zip'] }], false);
        path = picked[0] ?? null;
      }
      if (!path) throw new Error('No attendance backup found. Close the attendance app once to write one, or choose the file.');
      const got = await readAttendanceBackup(await env.system.readFile(path), loadSql);
      return { people: got.people, photos: got.photos, source: path.split(/[\\/]/).pop() ?? path };
    },
  },

  actions: [
    {
      id: 'dashboard',
      label: 'Open live dashboard',
      primary: true,
      async run(env) {
        const { base, token } = await kiosk(env);
        if (!base) throw new Error('Enter the kiosk’s address in Settings › Connections first.');
        await env.system.openUrl(`${base}/attendance${token ? `?token=${encodeURIComponent(token)}` : ''}`);
        return 'Opened the live attendance dashboard.';
      },
    },
  ],
};

export const attendancePlugin: ConnectorPlugin = { connector: attendanceConnector };
