import type { Figure } from './overview';
import type { ExternalPerson } from './terminal';

// The contract every connected system implements. A connector is a plain object that
// declares what it can do; Keystone discovers its abilities from the fields present and
// never calls one that is missing. Every call is time-limited and caught, so a system
// that is offline, not installed or misbehaving cannot break any other part of the app.
//
// Adding a system = adding one folder under apps/keystone/src/connectors/ and one line
// to its index. Nothing else in Keystone changes.

export type PlatformName = 'macos' | 'windows' | 'linux' | 'web';

/** A per-machine setting the connector needs, drawn as a form in Settings › Connections. */
export interface SettingField {
  key: string;
  label: string;
  kind: 'text' | 'url' | 'secret' | 'toggle';
  placeholder?: string;
  help?: string;
  default?: string;
}

export type HealthState = 'ready' | 'setup' | 'offline' | 'error' | 'unsupported';

export interface Health {
  state: HealthState;
  /** One sentence for the person: what is connected, or what to do. */
  detail: string;
  version?: string;
  /** A newer version than the one installed, when the system can tell. */
  update?: { version: string; url: string };
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
  bytes(): Promise<Uint8Array>;
}

export interface HttpRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

/** HTTP from the app's native side: no browser CORS, a cookie jar, any headers. */
export interface HttpClient {
  request(url: string, init?: HttpRequest): Promise<HttpResponse>;
  /** False in the browser preview, where cross-site calls are blocked. */
  readonly native: boolean;
}

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
  locateApp(locator: AppLocator): Promise<InstalledApp | null>;
  /** Starts an app, optionally handing it files and environment variables. */
  launchApp(app: InstalledApp, files?: string[], env?: Record<string, string>): Promise<void>;
  openUrl(url: string): Promise<void>;
  pickFiles(title: string, filters: FileFilter[], multiple: boolean): Promise<string[]>;
  readFile(path: string): Promise<Uint8Array>;
  /** Files in a folder, newest first. Empty when the folder does not exist. */
  listFiles(folder: string): Promise<{ path: string; modified: number }[]>;
  /** Another app's local data folder, from its bundle identifier ("com.alphapremier.attendance"). */
  appDataFolder(identifier: string): Promise<string | null>;
}

export interface ConnectorEnv {
  settings: Record<string, string>;
  secret(key: string): Promise<string | null>;
  http: HttpClient;
  system: SystemBridge;
  now(): Date;
}

/** Something the person can trigger from the connector's card. */
export interface ConnectorAction {
  id: string;
  label: string;
  primary?: boolean;
  /** Returns the confirmation to show. */
  run(env: ConnectorEnv): Promise<string>;
}

/** A photo handed back by a connector, keyed by the person's id in that system. */
export interface ExternalPhoto {
  externalId: string;
  bytes: Uint8Array;
  type: 'image/webp' | 'image/jpeg' | 'image/png';
}

export interface PeopleSource {
  /** Shown on the button: "Import employees from the attendance backup". */
  label: string;
  fetch(env: ConnectorEnv): Promise<{ people: ExternalPerson[]; photos: ExternalPhoto[]; source: string }>;
}

export interface Connector {
  id: string;
  name: string;
  /** One line on what the system is. */
  about: string;
  platforms: PlatformName[];
  settings: SettingField[];
  /** Is it there and usable right now? Called on open and every minute. */
  health(env: ConnectorEnv): Promise<Health>;
  /** Live figures for the home screen. */
  figures?(env: ConnectorEnv): Promise<Figure[]>;
  /** People to bring into the directory as employees. */
  people?: PeopleSource;
  actions?: ConnectorAction[];
  /** How often to refresh figures, in seconds. Default 60. */
  refreshSeconds?: number;
}

/** Runs a connector call with a deadline; a slow system reports offline instead of hanging. */
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
  if (typeof c.health !== 'function') return `Connector "${c.id}" has no health check.`;
  const keys = c.settings.map((s) => s.key);
  if (new Set(keys).size !== keys.length) return `Connector "${c.id}" repeats a setting key.`;
  return null;
}
