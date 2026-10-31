import type { AppLocator, Connector, ConnectorEnv, PlatformName } from '@keystone/core';
import type { ConnectorPlugin } from '@keystone/kit';

// Alpha Branding Studio (Alpha_Branding): frames listing photos in the official gold
// template and exports them. Native on both platforms (SwiftUI and WPF).
//
// What Keystone uses, all of it already in the studio:
// - finding it: bundle id com.alphapremier.brandingstudio on macOS; the Uninstall
//   registry key "Alpha Premier Realty Branding Studio" (DisplayIcon, DisplayVersion) on Windows;
// - handing it photos at launch: an open-documents event on macOS (App.swift application(_:open:)),
//   file paths as arguments on Windows (MainWindow_Loaded). They arrive staged, ready for
//   APPLY BRANDING; the studio has no way to set the file prefix from outside;
// - its releases on GitHub, to tell when the installed copy is behind.

export const STUDIO: AppLocator = {
  macBundleId: 'com.alphapremier.brandingstudio',
  macAppName: 'Alpha Branding Studio',
  windowsUninstallKey: 'Alpha Premier Realty Branding Studio',
  windowsExe: 'Alpha.Branding.exe',
};

const RELEASES = 'https://api.github.com/repos/Deign86/Alpha_Branding/releases/latest';
const RELEASES_PAGE = 'https://github.com/Deign86/Alpha_Branding/releases/latest';

/** Same extensions both studios accept (ImageEngine.swift, MainWindowViewModel.IsSupportedMedia). */
export const MEDIA = {
  photos: ['jpg', 'jpeg', 'jfif', 'png', 'bmp', 'webp', 'heic', 'heif'],
  macVideos: ['mp4', 'mov', 'm4v'],
  windowsVideos: ['mp4', 'mov', 'wmv', 'avi', 'm4v', 'mkv', 'webm'],
};

/** "2.5.0.0" and "v2.5.0" compare as equal; true when `latest` is newer. */
export function isNewer(latest: string, installed: string): boolean {
  const parts = (v: string) => v.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const a = parts(latest);
  const b = parts(installed);

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }

  return false;
}

interface Release {
  tag_name: string;
  html_url: string;
  assets: { name: string; browser_download_url: string }[];
}

/** The installer for this platform from the latest release. */
export function installerFor(release: Release, platform: PlatformName): string {
  const want = platform === 'windows' ? /Setup\.exe$/i : platform === 'macos' ? /-macos\.pkg$/i : null;

  return (want && release.assets.find((a) => want.test(a.name))?.browser_download_url) || release.html_url || RELEASES_PAGE;
}

async function latestRelease(env: ConnectorEnv): Promise<Release | null> {
  try {
    const r = await env.http.request(RELEASES, { headers: { Accept: 'application/vnd.github+json' }, timeoutMs: 6000 });

    return r.ok ? await r.json<Release>() : null;
  } catch {
    return null;
  }
}

async function installed(env: ConnectorEnv) {
  const app = await env.system.locateApp(STUDIO);

  if (!app) throw new Error('Alpha Branding Studio is not installed on this computer.');

  return app;
}

export const brandingStudioConnector: Connector = {
  id: 'branding-studio',
  name: 'Alpha Branding Studio',
  about: 'Applies the official gold frame to listing photos, crops and pairs them, and exports a ZIP.',
  platforms: ['macos', 'windows'],
  settings: [],
  refreshSeconds: 600,

  async health(env) {
    if (env.system.platform === 'web') {
      return { state: 'unsupported', detail: 'Open Keystone’s desktop app on Windows or macOS to use Branding Studio from here.' };
    }

    if (env.system.platform === 'linux') {
      return { state: 'unsupported', detail: 'Branding Studio runs on Windows and macOS only.' };
    }

    const [app, release] = await Promise.all([env.system.locateApp(STUDIO), latestRelease(env)]);
    const latest = release?.tag_name.replace(/^v/i, '');

    if (!app) {
      return {
        state: 'setup',
        detail: `Not installed on this computer${latest ? `; version ${latest} is available` : ''}.`,
        ...(release ? { update: { version: latest!, url: installerFor(release, env.system.platform) } } : {}),
      };
    }

    const version = app.version?.replace(/\.0$/, '');
    const behind = release && version && isNewer(release.tag_name, version);

    return {
      state: 'ready',
      detail: version ? `Version ${version} installed${behind ? `; ${latest} is out` : ', up to date'}.` : 'Installed.',
      ...(version ? { version } : {}),
      ...(behind ? { update: { version: latest!, url: installerFor(release!, env.system.platform) } } : {}),
    };
  },

  actions: [
    {
      id: 'brand-photos',
      label: 'Brand listing photos…',
      primary: true,
      async run(env) {
        const app = await installed(env);
        const videos = env.system.platform === 'windows' ? MEDIA.windowsVideos : MEDIA.macVideos;

        const files = await env.system.pickFiles('Choose listing photos or videos to brand', [
          { name: 'Photos and videos', extensions: [...MEDIA.photos, ...videos] },
        ], true);

        if (!files.length) return 'No photos chosen.';
        await env.system.launchApp(app, files);

        return `${files.length === 1 ? 'One file' : `${files.length} files`} handed to Branding Studio. Check the prefix there, then click Apply Branding.`;
      },
    },
    {
      id: 'open',
      label: 'Open studio',
      async run(env) {
        await env.system.launchApp(await installed(env));

        return 'Opened Alpha Branding Studio.';
      },
    },
    {
      id: 'download',
      label: 'Download latest',
      async run(env) {
        const release = await latestRelease(env);
        await env.system.openUrl(release ? installerFor(release, env.system.platform) : RELEASES_PAGE);

        return release ? `Downloading Branding Studio ${release.tag_name}.` : 'Opened the Branding Studio releases page.';
      },
    },
  ],
};

export const brandingStudioPlugin: ConnectorPlugin = { connector: brandingStudioConnector };
