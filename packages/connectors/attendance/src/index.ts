import {
  count, isNewer, latestRelease, type AppLocator, type Connector, type ConnectorEnv, type Figure, type GitHubRelease, type Health,
  type InstalledApp, type PlatformName,
} from '@keystone/core';
import type { ConnectorPlugin } from '@keystone/kit';
import { loadSql } from './sql';
import { readAttendanceBackup } from './backup';

// Alpha Premier Attendance (alpha-premier-attendance): the RFID kiosk at the front desk.
//
// What Keystone uses, all of it already in the attendance app:
// - finding it on this computer: bundle id com.alphapremier.attendance on macOS (the app is
//   "Alpha Premier Attendance"); on Windows the Uninstall registry key "Alpha Premier Attendance" that its
//   per-machine NSIS installer writes (Tauri names it after productName), with alpha-premier-attendance.exe;
// - its releases on GitHub (Deign86/alpha-premier-attendance), to tell when the installed copy is behind:
//   one x64 setup .exe for Windows, one .dmg per chip (aarch64, x64) for macOS;
// - its read-only LAN viewer on port 4173 (src-tauri/src/lan_server.rs), off until someone turns it on:
//   GET /api/health, GET /api/attendance/today?date=, the /attendance dashboard,
//   with the optional viewer token in X-Viewer-Token;
// - its portable backup (.apbackup), written on every clean exit to
//   <LocalAppData>/com.alphapremier.attendance/backups, for the employee list and photos.
// The LAN viewer deliberately never serves the roster or photos (docs/lan-dashboard-deployment.md),
// which is why the people come from the backup.

const IDENTIFIER = 'com.alphapremier.attendance';
const DEFAULT_PORT = 4173;
const REPO = 'Deign86/alpha-premier-attendance';
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

export const ATTENDANCE_APP: AppLocator = {
  macBundleId: IDENTIFIER,
  macAppName: 'Alpha Premier Attendance',
  windowsUninstallKey: 'Alpha Premier Attendance',
  windowsExe: 'alpha-premier-attendance.exe',
};

/** Windows gets the setup .exe. macOS has one .dmg per chip and Keystone cannot tell which, so the release page. */
export function attendanceInstallerFor(release: GitHubRelease, platform: PlatformName): string {
  const setup = platform === 'windows' ? release.assets.find((a) => /_x64-setup\.exe$/i.test(a.name)) : undefined;

  return setup?.browser_download_url || release.html_url || RELEASES_PAGE;
}

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
  const chosen = env.settings.backupFolder?.trim();
  const folders = chosen ? [chosen] : [];
  const local = await env.system.appDataFolder(IDENTIFIER);

  if (local) folders.push(`${local}${local.includes('\\') ? '\\' : '/'}backups`);

  for (const f of folders) {
    const found = (await env.system.listFiles(f)).filter((x) => x.path.toLowerCase().endsWith('.apbackup'));

    if (found.length) return found[0].path;
  }

  return null;
}

/** The kiosk's own state from its LAN viewer, or null when no address is set. */
async function kioskHealth(env: ConnectorEnv): Promise<Health | null> {
  const { base, headers } = await kiosk(env);

  if (!base) return null;
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
}

/**
 * The card's state: the kiosk's when an address is set, with the installed app's version and any update added;
 * otherwise the app on this computer. Installed here counts as connected, as Branding Studio does: the live figures
 * need the LAN viewer, which the attendance app keeps off until someone turns it on.
 */
export function withInstall(live: Health | null, app: InstalledApp | null, release: GitHubRelease | null, platform: PlatformName): Health {
  const latest = release?.tag_name.replace(/^v/i, '');
  const version = app?.version;
  const behind = Boolean(release && version && isNewer(release.tag_name, version));
  const update = release && (!app || behind) ? { version: latest!, url: attendanceInstallerFor(release, platform) } : undefined;
  let health: Health;

  if (live) health = { ...live };
  else if (app) {
    const state = version ? `Version ${version} on this computer${behind ? `; ${latest} is out` : ', up to date'}` : 'Installed on this computer';

    health = { state: 'ready', detail: `${state}; add the kiosk’s LAN address in Settings for live figures.` };
  } else if (platform === 'macos' || platform === 'windows') {
    health = { state: 'setup', detail: `Enter the kiosk’s address to see today’s attendance here, or install the attendance app on this computer${latest ? ` (version ${latest})` : ''}.` };
  } else health = { state: 'setup', detail: 'Enter the kiosk’s address to see today’s attendance here.' };

  if (version) health.version = version;

  if (update) health.update = update;

  return health;
}

export const attendanceConnector: Connector = {
  id: 'attendance',
  name: 'Attendance Tracker',
  tag: 'RFID',
  about: 'The RFID time-in kiosk at the front desk, with payroll PDFs and the bathroom key log.',
  platforms: ['windows', 'macos', 'linux', 'web'],
  refreshSeconds: 30,
  settings: [
    { key: 'address', label: 'Kiosk address', kind: 'text', placeholder: '192.168.1.50:4173', help: 'The address shown in the attendance app under Live attendance › Share on the LAN. Port 4173 is assumed when you leave it out.' },
    { key: 'token', label: 'Viewer token', kind: 'secret', help: 'Only when the kiosk’s LAN viewer uses a password (auth_mode = "password" in its config.toml).' },
    { key: 'backupFolder', label: 'Backup folder', kind: 'text', placeholder: '\\\\FRONTDESK\\attendance-backups', help: 'Where to find the attendance backups when Keystone runs on a different PC. On the kiosk PC itself, leave this empty.' },
  ],

  async health(env) {
    const desktop = env.system.platform === 'macos' || env.system.platform === 'windows';

    const [app, release, live] = await Promise.all([
      desktop ? env.system.locateApp(ATTENDANCE_APP) : null,
      desktop ? latestRelease(env, REPO) : null,
      kioskHealth(env),
    ]);

    return withInstall(live, app, release, env.system.platform);
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
      id: 'open',
      label: 'Open attendance app',
      primary: true,
      async run(env) {
        if (env.system.platform === 'web') throw new Error('Open Keystone’s desktop app to open the attendance app.');
        const app = await env.system.locateApp(ATTENDANCE_APP);

        if (!app) throw new Error('The attendance app is not installed on this computer. Use Download latest to get it.');
        await env.system.launchApp(app);

        return 'Opened Alpha Premier Attendance.';
      },
    },
    {
      id: 'dashboard',
      label: 'Open live dashboard',
      async run(env) {
        const { base, token } = await kiosk(env);

        if (!base) throw new Error('Turn on the LAN viewer in the attendance app (Live attendance › Share on the LAN), then enter its address in Settings › Connections.');
        await env.system.openUrl(`${base}/attendance${token ? `?token=${encodeURIComponent(token)}` : ''}`);

        return 'Opened the live attendance dashboard.';
      },
    },
    {
      id: 'download',
      label: 'Download latest',
      async run(env) {
        const release = await latestRelease(env, REPO);
        const url = release ? attendanceInstallerFor(release, env.system.platform) : RELEASES_PAGE;
        await env.system.openUrl(url);

        if (release && url !== release.html_url) return `Downloading the attendance app ${release.tag_name}.`;

        return env.system.platform === 'macos'
          ? 'Opened the attendance app’s latest release. Choose the aarch64 .dmg for Apple silicon or the x64 one for Intel.'
          : 'Opened the attendance app’s latest release.';
      },
    },
  ],
};

export const attendancePlugin: ConnectorPlugin = { connector: attendanceConnector };
