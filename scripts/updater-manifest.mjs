// Writes latest.json, the manifest Keystone's updater reads from the latest GitHub release, after checking every
// update file's signature against the public key the app ships with. A release whose signatures would not verify
// in the installed app fails here instead.
//
//   node scripts/updater-manifest.mjs <installers-folder> <tag> <owner/repo>
//
// Expects, in the folder, the files the desktop builds upload when TAURI_SIGNING_PRIVATE_KEY is set:
//   macOS    Keystone.app.tar.gz + .sig   (universal; renamed here to Keystone_<version>_universal.app.tar.gz)
//   Windows  Keystone_<version>_x64-setup.exe + .sig
// Exits 2, writing nothing, when there are no signatures: that release has no updates (see README › Making a release).

import { createHash, createPublicKey, verify } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [folder, tag, repo] = process.argv.slice(2);

if (!folder || !tag || !repo) {
  console.error('usage: node scripts/updater-manifest.mjs <installers-folder> <tag> <owner/repo>');
  process.exit(64);
}

const version = tag.replace(/^v/, '');
const config = JSON.parse(readFileSync('apps/keystone/src-tauri/tauri.conf.json', 'utf8'));
const pubkey = config.plugins?.updater?.pubkey;

if (!pubkey) {
  console.error('apps/keystone/src-tauri/tauri.conf.json has no plugins.updater.pubkey.');
  process.exit(1);
}

/** The base64 payload on the second line of a minisign file, which Tauri stores base64-encoded once more. */
const minisignLines = (wrapped) => Buffer.from(wrapped.trim(), 'base64').toString('utf8').split('\n');

const keyBytes = Buffer.from(minisignLines(pubkey)[1], 'base64');
const keyId = keyBytes.subarray(2, 10);
const publicKey = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: keyBytes.subarray(10, 42).toString('base64url') }, format: 'jwk' });

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** Verifies a minisign signature the way the updater does: Ed25519 over BLAKE2b-512 of the file, then the trusted comment. */
function check(file, signatureText) {
  const lines = minisignLines(signatureText);
  const signature = Buffer.from(lines[1], 'base64');
  const trustedComment = lines[2].replace(/^trusted comment: /, '');
  const globalSignature = Buffer.from(lines[3], 'base64');

  if (signature.subarray(0, 2).toString() !== 'ED') fail(`${file}: not a prehashed (ED) minisign signature.`);

  if (!signature.subarray(2, 10).equals(keyId)) fail(`${file}: signed with a different key than the app's.`);
  const digest = createHash('blake2b512').update(readFileSync(file)).digest();

  if (!verify(null, digest, publicKey, signature.subarray(10, 74))) fail(`${file}: the signature does not match.`);

  if (!verify(null, Buffer.concat([signature.subarray(10, 74), Buffer.from(trustedComment)]), publicKey, globalSignature)) {
    fail(`${file}: the trusted comment's signature does not match.`);
  }
}

const files = readdirSync(folder);
const macArchive = files.find((f) => f.endsWith('.app.tar.gz'));
const windowsSetup = files.find((f) => f.endsWith('_x64-setup.exe'));
const platforms = {};
const url = (name) => `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(name)}`;

function add(file, keys) {
  const path = join(folder, file);

  if (!existsSync(`${path}.sig`)) return;
  const signature = readFileSync(`${path}.sig`, 'utf8').trim();
  check(path, signature);

  for (const key of keys) platforms[key] = { signature, url: url(file) };
}

if (macArchive) {
  const named = `Keystone_${version}_universal.app.tar.gz`;

  if (macArchive !== named) {
    renameSync(join(folder, macArchive), join(folder, named));

    if (existsSync(join(folder, `${macArchive}.sig`))) renameSync(join(folder, `${macArchive}.sig`), join(folder, `${named}.sig`));
  }

  add(named, ['darwin-aarch64', 'darwin-x86_64']);
}

if (windowsSetup) add(windowsSetup, ['windows-x86_64']);

if (!Object.keys(platforms).length) {
  console.error('No signed update files: this release cannot update installed copies.');
  process.exit(2);
}

const manifest = {
  version,
  notes: `What's new: https://github.com/${repo}/releases/tag/${tag}`,
  pub_date: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  platforms,
};

writeFileSync(join(folder, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');

console.log(`latest.json for ${version}: ${Object.keys(platforms).join(', ')}; every signature verified.`);
