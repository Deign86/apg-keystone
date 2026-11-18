import { describe, expect, it } from 'vitest';
import type { Connector, ReleaseAsset, SystemBridge } from '@keystone/core';
import { connectors } from '../connectors';
import apps from '../../src-tauri/src/connected-apps.json';
import native from '../../src-tauri/src/lib.rs?raw';

// The native side decides which repositories and files Keystone may fetch (allowed_repo and allowed_installer in
// src-tauri/src/lib.rs, docs/adr/0029), and a connector that asks for anything else is refused only at run time, on
// someone's desk. So what each installed connector would ask is written down once, in
// src-tauri/src/connected-apps.json: its repository and the installers of one real release. This test holds that file
// to the connectors, and `cargo test` runs every line of it through the native functions themselves.

const COMPUTERS = [['windows', undefined], ['macos', 'arm64'], ['macos', 'x64']] as const;
const described = new Map(Object.entries(apps));

/** What a connector asks of the native side on each kind of computer, when its app is not installed. */
async function asked(connector: Connector) {
  const repos = new Set<string>();
  const installed: ReleaseAsset[] = [];

  for (const [platform, arch] of COMPUTERS) {
    const system: SystemBridge = {
      platform,
      arch,
      locateApp: async () => null,
      launchApp: async () => {},
      openUrl: async () => {},
      latestRelease: async (repo) => {
        repos.add(repo);
        const app = [...described.values()].find((a) => a.repo === repo);

        return {
          version: app?.tag.slice(1) ?? '0',
          assets: (app?.installers ?? []).map((name) => ({ name, url: `https://github.com/${repo}/releases/download/${app?.tag}/${name}` })),
        };
      },
      installFrom: async (asset) => { installed.push(asset); },
    };

    await connector.open({ system });
  }

  return { repos: [...repos], installed };
}

describe('what the connectors ask of the native side', () => {
  it.each(connectors.map((c) => [c.id, c] as const))('%s asks only for what connected-apps.json says', async (id, connector) => {
    const { repos, installed } = await asked(connector);
    const app = described.get(id);

    if (!app) {
      expect(repos, `${id} asks GitHub for a release: describe it in src-tauri/src/connected-apps.json`).toEqual([]);

      return;
    }

    expect(repos).toEqual([app.repo]);
    expect(installed.map((a) => a.name), `${id} must find its installer on Windows, an Apple-silicon Mac and an Intel Mac`).toHaveLength(COMPUTERS.length);
    expect([...new Set(installed.map((a) => a.name))].sort()).toEqual([...app.installers].sort());
  });

  it('describes no app whose connector is not installed', () => {
    const ids = connectors.map((c) => c.id);

    for (const id of described.keys()) expect(ids).toContain(id);
  });

  // The same two decisions as allowed_repo and allowed_installer, read from the Rust source, so `npm run check` fails
  // before `cargo test` does. The native functions stay the judge.
  it('names only the owner and the installer types the native side allows', () => {
    const owner = /const OWNER: &str = "([^"]+)";/.exec(native)?.[1];
    const types = /const INSTALLER_TYPES: \[&str; \d+\] = \[([^\]]+)\];/.exec(native)?.[1].match(/[a-z0-9]+/g);

    expect(owner).toBeTruthy();
    expect(types?.length).toBeGreaterThan(0);

    for (const [id, app] of described) {
      expect(app.repo.split('/')[0], id).toBe(owner);

      for (const name of app.installers) expect(types, `${id}: ${name}`).toContain(name.slice(name.lastIndexOf('.') + 1).toLowerCase());
    }
  });
});
