// The contract every connected system implements: a shortcut on Home, its app's logo, that opens the app. A connector
// is a plain object. Opening it is time-limited and caught, so an app that is not installed or does not start shows a
// message and affects nothing else (docs/adr/0007).
//
// Adding a system = adding one package under packages/connectors/ and one line to
// apps/keystone/src/connectors.ts. Nothing else in Keystone changes.

export type PlatformName = 'macos' | 'windows' | 'linux' | 'web';

/** How to find another desktop app on this machine. */
export interface AppLocator {
  macBundleId?: string;
  macAppName?: string;
  /** Registry key name under ...\CurrentVersion\Uninstall (checked in HKCU then HKLM). */
  windowsUninstallKey?: string;
  windowsExe?: string;
}

export interface InstalledApp {
  path: string;
  version?: string;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

/** What the operating system lets a connector do. */
export interface SystemBridge {
  readonly platform: PlatformName;
  /** Null when the app is not installed, and always in the browser preview. */
  locateApp(locator: AppLocator): Promise<InstalledApp | null>;
  launchApp(app: InstalledApp): Promise<void>;
  openUrl(url: string): Promise<void>;
}

export interface ConnectorEnv {
  system: SystemBridge;
}

export interface Connector {
  id: string;
  name: string;
  /** Up to four capitals marking directory records linked to this system ("RFID"). */
  tag?: string;
  /** The app's own logo (an imported image), shown as its shortcut. */
  logo: string;
  /** Opens the app. Returns a sentence to show when it did something else (opened the download page, say). */
  open(env: ConnectorEnv): Promise<string | void>;
}

/** A desktop app another APG team ships, and where to get it. */
export interface DesktopApp {
  /** As the person knows it: "Alpha Premier Attendance". */
  name: string;
  locator: AppLocator;
  /** Its latest release page, opened when it is not installed. */
  downloads: string;
}

/** Starts an installed desktop app, or opens its download page when it is not on this computer. */
export async function openDesktopApp(system: SystemBridge, app: DesktopApp): Promise<string | void> {
  if (system.platform === 'web') throw new Error(`Open Keystone’s desktop app to open ${app.name}.`);
  const installed = await system.locateApp(app.locator);

  if (installed) return system.launchApp(installed);
  await system.openUrl(app.downloads);

  return `${app.name} is not on this computer, so its download page is open.`;
}

/** Runs a connector call with a deadline, so an app that hangs reports it instead of freezing the shortcut. */
export async function withDeadline<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not answer within ${Math.round(ms / 1000)} seconds.`)), ms);
  });

  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** Checks a connector definition when it registers, so a broken one is refused with a reason. */
export function validateConnector(c: Connector, existing: string[]): string | null {
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(c.id)) return `Connector id "${c.id}" must be lowercase letters, digits and dashes.`;

  if (existing.includes(c.id)) return `Two connectors use the id "${c.id}".`;

  if (!c.name.trim()) return `Connector "${c.id}" has no name.`;

  if (!c.logo) return `Connector "${c.id}" has no logo.`;

  return null;
}
