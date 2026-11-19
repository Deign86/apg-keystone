import type { Browser } from '@e2e-dev/web';

// Keystone's desktop app, as a Windows computer would show it, without Tauri: the page runs as it does in the desktop
// window (apps/keystone/src/platform/desktop.ts), and what it asks of the native side is answered here instead of by
// src-tauri. Nothing is fetched or installed; GitHub is never asked. The connected apps are the ones `installed`
// names, at those versions, and each repository's latest release is the one `releases` gives. Keystone itself is up
// to date and starts with no saved records.

/** A connected app found on this computer, by the Windows uninstall key its connector looks for. */
export type FakeInstalled = { windowsUninstallKey: string; path: string; version: string };

/** A repository's latest release: its tag and the names of its files. */
export type FakeRelease = { repo: string; tag: string; files: string[] };

export type FakeDesktop = {
  installed: FakeInstalled[];
  releases: FakeRelease[];
  /** Repositories whose latest release GitHub refuses to say (its limit of 60 questions an hour). */
  refused?: string[];
};

/** The real installers of the latest releases (Nov 19, 2026), and the uninstall keys their installers write. */
export const ATTENDANCE = {
  key: 'Alpha Premier Attendance',
  path: 'C:\\Program Files\\Alpha Premier Attendance\\alpha-premier-attendance.exe',
  release: {
    repo: 'Deign86/alpha-premier-attendance',
    tag: 'v0.2.57',
    files: ['Alpha.Premier.Attendance_0.2.57_aarch64.dmg', 'Alpha.Premier.Attendance_0.2.57_x64-setup.exe', 'Alpha.Premier.Attendance_0.2.57_x64.dmg', 'latest.json'],
  },
};

export const ID_MAKER = {
  key: '{6F0E2B6C-4D53-4C0B-9A8E-2C7B1D5A9E41}_is1',
  path: 'C:\\Program Files\\Alpha Premier ID Maker\\AlphaPremierIdMaker.exe',
  release: {
    repo: 'Deign86/apg-id-creator',
    tag: 'v2.0.4',
    files: ['AlphaPremierIdMaker-Mac-AppleSilicon-v2.0.4.dmg', 'AlphaPremierIdMaker-Mac-Intel-v2.0.4.dmg', 'AlphaPremierIdMaker-Portable-v2.0.4.exe', 'AlphaPremierIdMaker-Setup-v2.0.4.exe'],
  },
};

export const STUDIO = {
  key: 'Alpha Premier Realty Branding Studio',
  path: 'C:\\Users\\apg\\AppData\\Local\\Alpha Premier Realty\\Branding Studio\\Alpha.Branding.exe',
  release: {
    repo: 'Deign86/Alpha_Branding',
    tag: 'v2.8.1',
    files: ['Alpha.Branding-v2.8.1-macos.pkg', 'Alpha.Branding-v2.8.1-macos.zip', 'Alpha.Branding-v2.8.1-win-x64.zip', 'Alpha.Branding.Setup.exe'],
  },
};

/** One of the apps above, installed at `version`. */
export const installedAt = (app: typeof ATTENDANCE, version: string): FakeInstalled => ({ windowsUninstallKey: app.key, path: app.path, version });

/** Every app above at its latest release. */
export const LATEST: FakeRelease[] = [ATTENDANCE.release, ID_MAKER.release, STUDIO.release];

/** Makes the next page Keystone's desktop app on a fake Windows computer. Call before `app.open`. */
export async function fakeDesktop(browser: Browser, computer: FakeDesktop) {
  await browser.addInitScript((c: FakeDesktop) => {
    const ua = navigator.userAgent.replace(/\([^)]*\)/, '(Windows NT 10.0; Win64; x64)');
    const asked: string[] = [];

    Object.defineProperty(navigator, 'userAgent', { get: () => ua });

    type Args = { paths?: string[]; locator?: { windowsUninstallKey?: string }; repo?: string };

    /** What the native side answers: a path, a version, a yes or no, nothing, an installed app or a release. */
    type Answer = string | boolean | null | { path: string; version: string } | { version: string; assets: { name: string; url: string; digest: string }[] };

    const answer = (cmd: string, args: Args): Answer => {
      switch (cmd) {
        case 'cpu_arch': return 'x86_64';
        case 'plugin:path|resolve_directory': return 'C:/Users/apg/AppData/Roaming/com.alphapremier.keystone';
        case 'plugin:path|join': return (args.paths ?? []).join('/');
        case 'file_exists': return false;
        case 'write_file': return null;
        case 'plugin:app|version': return '1.0.0';
        case 'plugin:updater|check': return null;
        case 'locate_app': {
          const key = args.locator?.windowsUninstallKey;
          const app = c.installed.find((a) => a.windowsUninstallKey === key);

          return app ? { path: app.path, version: app.version } : null;
        }

        case 'latest_release': {
          const repo = String(args.repo);
          const release = c.releases.find((r) => r.repo === repo);

          asked.push(repo);

          // The native side refuses with a plain sentence (src-tauri/src/lib.rs).
          if (!release || c.refused?.includes(repo)) throw `GitHub answered 403 for ${repo}'s latest release.`;

          return {
            version: release.tag.replace(/^v/, ''),
            assets: release.files.map((name) => ({ name, url: `https://github.com/${repo}/releases/download/${release.tag}/${name}`, digest: 'sha256:00' })),
          };
        }

        case 'install_from':
        case 'launch_app':
        case 'plugin:opener|open_url': return null;
        default: throw `The fake desktop has no ${cmd}.`;
      }
    };

    let callbacks = 0;

    Object.assign(window, {
      __fakeDesktopAsked: asked,
      __TAURI_INTERNALS__: {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { windowLabel: 'main', label: 'main' } },
        plugins: {},
        convertFileSrc: (path: string) => path,
        transformCallback: () => ++callbacks,
        unregisterCallback: () => {},
        invoke: async (cmd: string, args: Args = {}) => answer(cmd, args),
      },
    });
  }, computer);
}

/** The repositories Keystone has asked GitHub about since the page opened. */
export const askedGitHub = (browser: Browser) => browser.evaluate((): string[] => window.__fakeDesktopAsked ?? []);

declare global {
  interface Window {
    /** Set by `fakeDesktop`: the repositories asked about, in order. */
    __fakeDesktopAsked?: string[];
  }
}
