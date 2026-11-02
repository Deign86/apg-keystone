import type { ConnectorEnv } from './connectors';

// Version checks against the GitHub releases of another APG app. Shared by every connector whose app ships there
// (Branding Studio, the attendance app), so they agree on what "newer" means and how the latest release is read.

export interface GitHubRelease {
  tag_name: string;
  html_url: string;
  assets: { name: string; browser_download_url: string }[];
}

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

/**
 * The latest release of `owner/repo`, or null when GitHub cannot be reached, the app has none, or the answer is not a
 * release (a captive portal or a proxy can answer 200 with something else).
 */
export async function latestRelease(env: ConnectorEnv, repo: string): Promise<GitHubRelease | null> {
  try {
    const r = await env.http.request(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      timeoutMs: 6000,
    });

    if (!r.ok) return null;
    const release = await r.json<Partial<GitHubRelease>>();

    return release.tag_name && release.html_url && Array.isArray(release.assets)
      ? { tag_name: release.tag_name, html_url: release.html_url, assets: release.assets }
      : null;
  } catch {
    return null;
  }
}
