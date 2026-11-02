// Checks that every installed part has its own end-to-end tests, so a new screen or connected system cannot ship
// without them and a removed one does not leave tests behind:
//
//   @keystone/module-<id>     in apps/keystone/package.json  →  e2e/modules/<id>.e2e.ts
//   @keystone/connector-<id>  in apps/keystone/package.json  →  e2e/connectors/<id>.e2e.ts
//
//   node scripts/check-e2e.mjs

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const KINDS = [
  { folder: 'e2e/modules', prefix: '@keystone/module-', part: 'module' },
  { folder: 'e2e/connectors', prefix: '@keystone/connector-', part: 'connector' },
];

const installed = Object.keys(JSON.parse(readFileSync('apps/keystone/package.json', 'utf8')).dependencies);
const problems = [];

for (const { folder, prefix, part } of KINDS) {
  const ids = installed.flatMap((name) => (name.startsWith(prefix) ? [name.slice(prefix.length)] : []));

  for (const id of ids) {
    const file = join(folder, `${id}.e2e.ts`);

    if (!existsSync(file)) problems.push(`${file} is missing: the ${part} ${prefix}${id} needs end-to-end tests (AGENTS.md › Tests).`);
    else if (!/\btest\(/.test(readFileSync(file, 'utf8'))) problems.push(`${file} has no test.`);
  }

  const files = existsSync(folder) ? readdirSync(folder) : [];

  for (const file of files) {
    const id = file.replace(/\.e2e\.ts$/, '');

    if (!ids.includes(id)) problems.push(`${join(folder, file)} tests ${prefix}${id}, which is not installed. Remove it with the ${part}.`);
  }
}

if (problems.length) {
  console.error('End-to-end tests missing or left over:\n  ' + problems.join('\n  '));
  process.exit(1);
}

console.log('End-to-end tests: every installed module and connector has its own.');
