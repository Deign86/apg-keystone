#!/usr/bin/env node
// Fails when one removable part of Keystone imports another, which is what would stop
// it from being taken out on its own. The rules are the ones in AGENTS.md:
//
//   modules/<a>      may import the kernel (app/, platform types, @keystone/*), its own folder. Not another module, not a connector.
//   connectors/<a>   may import the kernel, its own folder. Not another connector, not a module.
//   app/, platform/  (the kernel) never import modules/ or connectors/.
//   main.tsx         the composition root: the only file that imports the module and connector lists.
//   core kernel/     never imports core domains/.
//   core domains/    import the kernel, and at most domains/directory (which imports no domain).
//   packages/ui      imports neither @keystone/core nor the app: the design system stands alone.
//
// node scripts/check-boundaries.mjs   (exit 1 with every violation listed)

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'apps/keystone/src');
const core = join(root, 'packages/core/src');
const ui = join(root, 'packages/ui/src');

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : files(p);
    return /\.(tsx?|mjs)$/.test(name) ? [p] : [];
  });
}

const IMPORT = /(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function importsOf(file) {
  const src = readFileSync(file, 'utf8');
  return [...src.matchAll(IMPORT)].map((m) => m[1] ?? m[2]);
}

const rel = (p) => relative(root, p).split(sep).join('/');
const inside = (p, dir) => p === dir || p.startsWith(dir + sep);
/** The first folder under `base` that `p` sits in: modules/<this>/... */
const partOf = (p, base) => (inside(p, base) ? relative(base, p).split(sep)[0] : null);

const violations = [];
const flag = (file, spec, why) => violations.push(`${rel(file)}: imports "${spec}" — ${why}`);

for (const file of files(app)) {
  if (/[\\/]test[\\/]/.test(file)) continue; // tests may compose anything
  const isMain = file === join(app, 'main.tsx');
  const mod = partOf(file, join(app, 'modules'));
  const con = partOf(file, join(app, 'connectors'));
  const kernel = inside(file, join(app, 'app')) || inside(file, join(app, 'platform'));
  for (const spec of importsOf(file)) {
    if (!spec.startsWith('.')) continue;
    const target = resolve(dirname(file), spec);
    const tMod = partOf(target, join(app, 'modules'));
    const tCon = partOf(target, join(app, 'connectors'));
    const isList = (t, base) => t === join(base, 'index') || t === base;
    if (isMain) continue;
    if (kernel && (tMod || tCon)) flag(file, spec, 'the kernel must not depend on a module or connector');
    if (mod && mod !== 'index.ts') {
      if (tMod && tMod !== mod) flag(file, spec, `module "${mod}" must not import module "${tMod}"; contribute through ModuleDef or move shared code to app/kit`);
      if (tCon) flag(file, spec, `module "${mod}" must not import a connector; use the registry (useKeystone().registry.connectors)`);
    }
    if (con && con !== 'index.ts') {
      if (tCon && tCon !== con) flag(file, spec, `connector "${con}" must not import connector "${tCon}"`);
      if (tMod) flag(file, spec, `connector "${con}" must not import a module; ship screens in its own folder`);
    }
    if (!kernel && !mod && !con && (isList(target, join(app, 'modules')) || isList(target, join(app, 'connectors')))) {
      flag(file, spec, 'only main.tsx composes the module and connector lists');
    }
  }
}

for (const file of files(core)) {
  const kernel = inside(file, join(core, 'kernel'));
  const domain = inside(file, join(core, 'domains')) ? relative(join(core, 'domains'), file).replace(/\.tsx?$/, '') : null;
  for (const spec of importsOf(file)) {
    if (spec.includes('apps/') || spec.startsWith('@keystone/')) flag(file, spec, 'the core stands alone');
    if (!spec.startsWith('.')) continue;
    const target = resolve(dirname(file), spec);
    const tDomain = inside(target, join(core, 'domains')) ? relative(join(core, 'domains'), target).replace(/\.tsx?$/, '') : null;
    if (kernel && tDomain) flag(file, spec, 'the core kernel must not depend on a domain');
    if (domain && tDomain && tDomain !== domain && !(tDomain === 'directory' && domain !== 'directory')) {
      flag(file, spec, `domain "${domain}" may import the kernel and the directory only`);
    }
  }
}

for (const file of files(ui)) {
  for (const spec of importsOf(file)) {
    if (spec.startsWith('@keystone/core') || spec.includes('apps/')) flag(file, spec, 'the design system must not depend on Keystone’s rules or app');
  }
}

if (violations.length) {
  console.error(`Boundary check failed (${violations.length}):\n  ` + violations.join('\n  '));
  process.exit(1);
}
console.log('Boundaries hold: no module, connector or domain depends on another.');
