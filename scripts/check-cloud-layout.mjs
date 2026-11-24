// Checks that firestore.rules and Keystone agree on the layout of the cloud records. The rules cannot import
// TypeScript, so the layout is declared once, in packages/core/src/kernel/cloud-layout.json (CLOUD_LAYOUT in core, which
// the path builders and the registry use), and this fails when the rules name another collection, field, status or
// limit. It reads the rules; it never writes them.
//
//   node scripts/check-cloud-layout.mjs

import { readFileSync } from 'node:fs';

const layout = JSON.parse(readFileSync('packages/core/src/kernel/cloud-layout.json', 'utf8'));
const rules = readFileSync('firestore.rules', 'utf8');
const problems = [];

/** ['a', 'b'] as the rules write a list. */
const list = (items) => `[${items.map((i) => `'${i}'`).join(', ')}]`;
const all = (pattern) => [...rules.matchAll(pattern)].map((m) => m[1]);
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Every value found must be the declared one, and there must be at least one. */
function expectAll(what, found, declared) {
  if (!found.length) problems.push(`${what}: firestore.rules no longer has the line this check reads.`);

  for (const f of found) if (f !== declared) problems.push(`${what}: firestore.rules says ${f}, cloud-layout.json says ${declared}.`);
}

// The lists every member reads and writes.
expectAll('The record lists', all(/\blist in (\[[^\]]*\])/g), list(layout.lists));

// One record: its fields and the size of its body.
const record = /function record\(\) \{([\s\S]*?)\n {4}\}/.exec(rules)?.[1] ?? '';

expectAll('The fields of a record', [...record.matchAll(/hasOnly\((\[[^\]]*\])\)/g)].map((m) => m[1]), list(layout.recordFields));

expectAll('The longest body', all(/\bbody\.size\(\) < (\d+)/g), String(layout.maxBody));

// The company's details.
const company = new RegExp(`match /${layout.company.collection}/\\{id\\} \\{([\\s\\S]*?)\\n {6}\\}`).exec(rules)?.[1] ?? '';

expectAll('The document of the company’s details', [...company.matchAll(/\bid == '([^']*)'/g)].map((m) => m[1]), layout.company.id);

// A module's own collection: the fields beside its body, and its statuses.
const functions = [...rules.matchAll(/function \w+\([^)]*\) \{([\s\S]*?)\n {4}\}/g)].map((m) => m[1]);

for (const [collection, own] of Object.entries(layout.own)) {
  const fields = list([...layout.recordFields, ...own.fields]);
  const checked = functions.find((f) => f.includes(`hasOnly(${fields})`));

  if (!rules.includes(`match /${collection}/{`)) problems.push(`${collection}: firestore.rules has no match for this collection.`);

  if (!checked) {
    problems.push(`${collection}: no function in firestore.rules checks exactly the fields ${fields}.`);
    continue;
  }

  // A collection whose records have no status (saved drafts) declares none, and its function checks none.
  if (own.statuses) expectAll(`${collection}: its statuses`, [...checked.matchAll(/\bstatus in (\[[^\]]*\])/g)].map((m) => m[1]), list(own.statuses));
}

// Every collection the rules name under keystone/{company} is declared, and the other way round.
const named = all(/^ {6}match \/([a-z]+)\/\{/gm);
const declared = [layout.company.collection, ...Object.keys(layout.own), ...layout.reserved];

for (const c of named) if (!declared.includes(c)) problems.push(`firestore.rules names the collection "${c}", which cloud-layout.json does not declare (own or reserved).`);

for (const c of declared) if (!named.includes(c)) problems.push(`cloud-layout.json declares the collection "${c}", which firestore.rules does not name.`);

for (const c of layout.lists) if (declared.includes(c)) problems.push(`"${c}" is both a record list and a collection with rules of its own.`);

// The longest name of a member or a device.
expectAll('The longest name', all(/request\.resource\.data\.name\.size\(\) <= (\d+)/g), String(layout.maxName));

if (!same([...new Set(named)], named)) problems.push('firestore.rules matches one collection twice.');

if (problems.length) {
  console.error('firestore.rules and the declared cloud layout differ:\n  ' + problems.join('\n  '));
  console.error('\nChange both together (packages/core/src/kernel/cloud-layout.json), with an emulator test in e2e/cloud/ for the rules.');
  process.exit(1);
}

console.log(`Cloud layout: firestore.rules matches cloud-layout.json (${layout.lists.length} lists, ${declared.length} collections of their own).`);
