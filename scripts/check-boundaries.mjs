#!/usr/bin/env node
// Fails when one removable part of Keystone depends on another, which is what would stop
// it from being taken out on its own. Every part is a workspace package, so the rules are
// about packages and their manifests (see AGENTS.md and docs/adr/0005):
//
//   @keystone/ui                 depends on no other Keystone package: the design system stands alone.
//   @keystone/core               depends on no other Keystone package: the kernel stands alone.
//   @keystone/kit                may depend on core and ui. Never on a module or connector.
//   @keystone/module-<id>        may depend on core, ui and kit. Never on another module or a connector.
//   @keystone/connector-<id>     may depend on core, ui and kit. Never on another connector or a module.
//   @keystone/app                the composition root: the only package that lists modules and connectors,
//                                and inside it only src/modules.ts and src/connectors.ts (and tests) import them.
//
// And for every package:
//   - a package under packages/modules/<id> is named @keystone/module-<id>, under
//     packages/connectors/<id> @keystone/connector-<id>;
//   - every package it imports is declared in its package.json (no reaching for a
//     dependency that only happens to be installed); tests may also use the root's
//     devDependencies;
//   - another Keystone package is imported by its name only, or by a path that package
//     exports, never by a path into its files;
//   - no relative import leaves the package's folder.
//
// node scripts/check-boundaries.mjs   (exit 1 with every violation listed)

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => relative(root, p).split(sep).join('/');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const rootManifest = readJson(join(root, 'package.json'));

/** Expands the root workspace globs (only trailing "/*" is used) into package folders. */
function workspaces() {
  return rootManifest.workspaces.flatMap((w) => {
    if (!w.endsWith('/*')) return [join(root, w)];
    const base = join(root, w.slice(0, -2));
    return readdirSync(base).map((n) => join(base, n)).filter((d) => existsSync(join(d, 'package.json')));
  });
}

/** What a package is, from where it sits. */
function layerOf(dir) {
  const r = rel(dir);
  if (r === 'packages/ui') return 'ui';
  if (r === 'packages/core') return 'core';
  if (r === 'packages/kit') return 'kit';
  if (r.startsWith('packages/modules/')) return 'module';
  if (r.startsWith('packages/connectors/')) return 'connector';
  if (r === 'apps/keystone') return 'app';
  return 'unknown';
}

/** Which Keystone packages each layer may depend on. */
const ALLOWED = {
  ui: () => false,
  core: () => false,
  kit: (name) => name === '@keystone/core' || name === '@keystone/ui',
  module: (name) => ['@keystone/core', '@keystone/ui', '@keystone/kit'].includes(name),
  connector: (name) => ['@keystone/core', '@keystone/ui', '@keystone/kit'].includes(name),
  app: () => true,
};

const WHY = {
  ui: 'the design system depends on no Keystone package',
  core: 'the kernel depends on no Keystone package',
  kit: 'the kit knows no module and no connector; it may use core and ui only',
  module: 'a module may use core, ui and kit only; reach another module through a service (ModuleApp.service) or a link (useModuleApp().has/go)',
  connector: 'a connector may use core, ui and kit only; reach a module through a service (ModuleApp.service)',
};

function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'node_modules' || name === 'dist' ? [] : files(p);
    return /\.(tsx?|mjs)$/.test(name) && !name.endsWith('.d.ts') ? [p] : [];
  });
}

const IMPORT = /(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
const importsOf = (file) => [...readFileSync(file, 'utf8').matchAll(IMPORT)].map((m) => m[1] ?? m[2]);

/** "@scope/name/sub?url" -> ["@scope/name", "./sub"]; "react-dom/client" -> ["react-dom", "./client"]. */
function splitSpec(spec) {
  const clean = spec.split('?')[0];
  const parts = clean.split('/');
  const n = clean.startsWith('@') ? 2 : 1;
  const sub = parts.slice(n).join('/');
  return [parts.slice(0, n).join('/'), sub ? `./${sub}` : '.'];
}

const declared = (m) => new Set([...Object.keys(m.dependencies ?? {}), ...Object.keys(m.peerDependencies ?? {})]);
const rootDev = new Set(Object.keys(rootManifest.devDependencies ?? {}));
const builtins = new Set(builtinModules);

const violations = [];
const flag = (where, message) => violations.push(`${where}: ${message}`);

const packages = workspaces().map((dir) => ({ dir, manifest: readJson(join(dir, 'package.json')), layer: layerOf(dir) }));
const byName = new Map(packages.map((p) => [p.manifest.name, p]));

for (const { dir, manifest, layer } of packages) {
  const name = manifest.name;
  const where = rel(join(dir, 'package.json'));
  if (layer === 'unknown') flag(where, 'a workspace outside packages/{core,ui,kit,modules,connectors} or apps/keystone; give it a layer in scripts/check-boundaries.mjs');
  if (layer === 'module' && name !== `@keystone/module-${dir.split(sep).pop()}`) flag(where, `must be named @keystone/module-${dir.split(sep).pop()}`);
  if (layer === 'connector' && name !== `@keystone/connector-${dir.split(sep).pop()}`) flag(where, `must be named @keystone/connector-${dir.split(sep).pop()}`);

  // The manifest itself: a dependency that is declared is a dependency, used or not.
  const allowed = ALLOWED[layer] ?? (() => false);
  for (const dep of [...declared(manifest), ...Object.keys(manifest.devDependencies ?? {})]) {
    if (!dep.startsWith('@keystone/')) continue;
    if (!byName.has(dep)) flag(where, `depends on "${dep}", which is not a package in this workspace`);
    else if (!allowed(dep)) flag(where, `depends on "${dep}" — ${WHY[layer]}`);
  }

  const deps = declared(manifest);
  for (const file of files(dir)) {
    if (file.endsWith('.config.ts')) continue; // build and test configs read root files on purpose
    const isTest = /[\\/]test[\\/]/.test(file);
    for (const spec of importsOf(file)) {
      if (spec.startsWith('.')) {
        const target = resolve(dirname(file), spec);
        if (relative(dir, target).startsWith('..')) flag(rel(file), `imports "${spec}", which leaves ${name}; depend on the package that owns it instead`);
        continue;
      }
      if (spec.startsWith('node:') || builtins.has(spec)) continue;
      const [pkg, sub] = splitSpec(spec);
      if (pkg.startsWith('@keystone/')) {
        const target = byName.get(pkg);
        if (!target) { flag(rel(file), `imports "${spec}", which is not a package in this workspace`); continue; }
        if (!deps.has(pkg) && pkg !== name) flag(rel(file), `imports "${pkg}" without declaring it in ${where}`);
        if (sub !== '.' && !(target.manifest.exports && sub in target.manifest.exports)) {
          flag(rel(file), `imports "${spec}", a file inside ${pkg}; use what ${pkg} exports from its entry`);
        }
        if (layer === 'app' && !isTest && /^@keystone\/(module|connector)-/.test(pkg)) {
          const list = pkg.startsWith('@keystone/module-') ? 'src/modules.ts' : 'src/connectors.ts';
          if (rel(file) !== `apps/keystone/${list}`) flag(rel(file), `imports "${pkg}"; only ${list} lists the installed ${list.includes('modules') ? 'modules' : 'connectors'}`);
        }
        continue;
      }
      if (!deps.has(pkg) && !(isTest && rootDev.has(pkg))) flag(rel(file), `imports "${pkg}" without declaring it in ${where}`);
    }
  }
}

if (violations.length) {
  console.error(`Boundary check failed (${violations.length}):\n  ` + violations.join('\n  '));
  process.exit(1);
}
console.log(`Boundaries hold across ${packages.length} packages: every dependency is declared, and no module or connector depends on another.`);
