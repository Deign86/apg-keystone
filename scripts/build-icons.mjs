// Builds every platform's icons from shared/brand (see shared/brand/README.md). Run after the logo changes:
//
//   npm run icons
//
//   apps/keystone/src-tauri/icons/   Windows (icon.ico, Store tiles), Linux and the PNG sizes from icon-app.png;
//                                    macOS (icon.icns) from icon-macos.png; ios/ from icon-ios.png and android/
//                                    (adaptive, on the tile colour) from icon-android-fg.png, ready for a mobile build
//   apps/keystone/public/            the browser preview's favicon, Apple touch icon and web-app icons

import { copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const icons = 'apps/keystone/src-tauri/icons';
const web = 'apps/keystone/public';
const scratch = mkdtempSync(join(tmpdir(), 'keystone-icons-'));
const tauri = (...args) => execFileSync('npx', ['tauri', 'icon', ...args], { stdio: 'inherit', shell: process.platform === 'win32' });

try {
  tauri('shared/brand/icons.json', '--output', icons);

  tauri('shared/brand/icon-macos.png', '--output', join(scratch, 'macos'));
  copyFileSync(join(scratch, 'macos', 'icon.icns'), join(icons, 'icon.icns'));

  tauri('shared/brand/icon-ios.png', '--output', join(scratch, 'ios'), '--ios-color', '#0b0a08');
  rmSync(join(icons, 'ios'), { recursive: true, force: true });
  cpSync(join(scratch, 'ios', 'ios'), join(icons, 'ios'), { recursive: true });

  tauri('shared/brand/icon-app.png', '--output', join(scratch, 'web'), '--png', '32,180,192,512');
  mkdirSync(web, { recursive: true });
  copyFileSync(join(icons, 'icon.ico'), join(web, 'favicon.ico'));
  copyFileSync(join(scratch, 'web', '32x32.png'), join(web, 'favicon-32.png'));
  copyFileSync(join(scratch, 'web', '180x180.png'), join(web, 'apple-touch-icon.png'));
  copyFileSync(join(scratch, 'web', '192x192.png'), join(web, 'icon-192.png'));
  copyFileSync(join(scratch, 'web', '512x512.png'), join(web, 'icon-512.png'));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
