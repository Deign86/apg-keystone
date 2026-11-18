// The contract every connected system implements: a shortcut on Home, its app's logo, that opens the app. A connector
// is a plain object. Opening it is time-limited and caught, so an app that is not installed or does not start shows a
// message and affects nothing else (docs/adr/0007). Keystone is also where the other APG apps are installed from and,
// for one that has no updater of its own, updated (docs/adr/0029).
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

/** A file on a GitHub release. */
export interface ReleaseAsset {
  name: string;
  /** Its download address on github.com. */
  url: string;
  /** "sha256:…" as GitHub publishes it; the download is checked against it. */
  digest?: string;
}

/** An app's latest published release. */
export interface AppRelease {
  /** Without a leading "v": "2.0.4". */
  version: string;
  assets: ReleaseAsset[];
}

/** What the operating system lets a connector do. */
export interface SystemBridge {
  readonly platform: PlatformName;
  /** The processor, where it matters for which installer to fetch (a Mac). */
  readonly arch?: 'arm64' | 'x64';
  /** The latest release of an APG app's GitHub repository ("Deign86/apg-id-creator"). Desktop only. */
  latestRelease?(repo: string): Promise<AppRelease>;
  /** Downloads a release file, checks it against its digest and opens it: the setup program, or the disk image. Desktop only. */
  installFrom?(asset: ReleaseAsset): Promise<void>;
  /** Null when the app is not installed, and always in the browser preview. */
  locateApp(locator: AppLocator): Promise<InstalledApp | null>;
  launchApp(app: InstalledApp): Promise<void>;
  openUrl(url: string): Promise<void>;
}

export interface ConnectorEnv {
  system: SystemBridge;
  /** Says what is taking long ("Downloading …"), and gives the work the time a download needs instead of an opening's few seconds. */
  slow?(what: string): void;
}

/** A newer version of a connected app that Keystone can install. */
export interface ConnectorUpdate {
  version: string;
  /** Downloads and opens its installer. Returns the sentence to show. */
  install(env: ConnectorEnv): Promise<string | void>;
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
  /** For an app with no updater of its own: the newer version out, or null. Never throws for being offline. */
  update?(env: ConnectorEnv): Promise<ConnectorUpdate | null>;
}

/** A desktop app another APG team ships, and where to get it. */
export interface DesktopApp {
  /** As the person knows it: "Alpha Premier Attendance". */
  name: string;
  locator: AppLocator;
  /**
   * Its GitHub repository, whose latest release holds the installers: "Deign86/alpha-premier-attendance". The native
   * side refuses any other owner's (apps/keystone/src/test/connected-apps.test.ts holds every connector to that).
   */
  repo: string;
  /** Which file of a release is the installer for each computer, by its name: /_x64-setup\.exe$/, /_aarch64\.dmg$/. */
  installers: { windows?: RegExp; macArm?: RegExp; macIntel?: RegExp };
}

/** An app's latest release page, opened when its installer cannot be fetched. */
const downloadsPage = (app: DesktopApp) => `https://github.com/${app.repo}/releases/latest`;

/** True when version `a` is later than `b`: "2.0.10" is later than "2.0.4". Anything not a number counts as 0. */
export function laterVersion(a: string, b: string): boolean {
  const parts = (v: string) => v.replace(/^v/i, '').split(/[.+-]/).map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];

  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }

  return false;
}

/** The installer in a release for this computer, or undefined when the release has none. */
function installerFor(system: SystemBridge, app: DesktopApp, release: AppRelease): ReleaseAsset | undefined {
  const named = system.platform === 'windows' ? app.installers.windows
    : system.platform === 'macos' ? (system.arch === 'x64' ? app.installers.macIntel : app.installers.macArm)
    : undefined;

  return named ? release.assets.find((a) => named.test(a.name)) : undefined;
}

/** Fetches the app's installer for this computer and opens it. False when Keystone cannot (no release, no installer for this computer). */
async function fetchInstaller(env: ConnectorEnv, app: DesktopApp, release?: AppRelease): Promise<string | false> {
  const { system } = env;

  if (!system.latestRelease || !system.installFrom) return false;
  env.slow?.(`Getting ${app.name}…`);
  const latest = release ?? await system.latestRelease(app.repo);
  const installer = installerFor(system, app, latest);

  if (!installer) return false;
  env.slow?.(`Downloading ${app.name} ${latest.version}…`);
  await system.installFrom(installer);

  return latest.version;
}

/**
 * Starts an installed desktop app. When it is not on this computer, downloads its installer from its latest release
 * and opens it; when that cannot be done (offline, no installer for this computer), opens its download page.
 */
export async function openDesktopApp(env: ConnectorEnv | SystemBridge, app: DesktopApp): Promise<string | void> {
  const e: ConnectorEnv = 'system' in env ? env : { system: env };
  const { system } = e;

  if (system.platform === 'web') throw new Error(`Open Keystone’s desktop app to open ${app.name}.`);
  const installed = await system.locateApp(app.locator);

  if (installed) return system.launchApp(installed);

  const version = await fetchInstaller(e, app).catch(() => false as const);

  if (version) return `${app.name} ${version} was not on this computer. Its installer is open: finish it, then open ${app.name} here again.`;
  await system.openUrl(downloadsPage(app));

  return `${app.name} is not on this computer, so its download page is open.`;
}

/**
 * For a desktop app with no updater of its own: the newer version out, when the app is installed and Keystone can
 * tell. Null otherwise, and when offline: an update is never a reason the shortcut fails. A connector whose app
 * updates itself leaves `update` out; one whose app cannot sets `update` to this.
 */
export async function desktopAppUpdate(env: ConnectorEnv, app: DesktopApp): Promise<ConnectorUpdate | null> {
  const { system } = env;

  if (!system.latestRelease || !system.installFrom) return null;

  try {
    const installed = await system.locateApp(app.locator);

    if (!installed?.version) return null;
    const release = await system.latestRelease(app.repo);

    if (!laterVersion(release.version, installed.version) || !installerFor(system, app, release)) return null;

    return {
      version: release.version,
      install: async (e) => {
        const version = await fetchInstaller(e, app, release);

        if (!version) throw new Error(`${app.name} ${release.version} has no installer for this computer.`);

        return `The installer for ${app.name} ${version} is open. Close ${app.name} first, then finish the installer.`;
      },
    };
  } catch {
    return null;
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
