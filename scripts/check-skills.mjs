// Checks that every agent skill in the repo loads: each one in .agents/skills is reachable from
// .claude/skills (where Claude Code looks), each skill's SKILL.md names its own folder, and every hook in
// .claude/settings.json that runs a script from the repo finds it.
//
//   node scripts/check-skills.mjs

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const problems = [];
const skillName = (dir) => /^name:\s*(.+)$/m.exec(readFileSync(join(dir, 'SKILL.md'), 'utf8'))?.[1].trim();

for (const name of readdirSync('.agents/skills')) {
  const link = join('.claude/skills', name);

  if (!existsSync(link)) {
    problems.push(`${link} is missing: link it with  ln -s ../../.agents/skills/${name} ${link}`);
  } else if (!statSync(link).isDirectory()) {
    problems.push(`${link} is a plain file, not a link to the skill. On Windows, turn on Developer Mode, run  git config core.symlinks true  and then  git checkout -- .claude/skills`);
  }
}

for (const name of readdirSync('.claude/skills')) {
  const dir = join('.claude/skills', name);

  if (!existsSync(dir)) {
    problems.push(`${dir} is a broken link.`);
    continue;
  }

  if (!statSync(dir).isDirectory()) continue;

  if (!existsSync(join(dir, 'SKILL.md'))) {
    problems.push(`${dir} has no SKILL.md.`);
  } else if (skillName(dir) !== name) {
    problems.push(`${dir}/SKILL.md is named "${skillName(dir)}", not "${name}".`);
  }
}

if (existsSync('.claude/settings.json')) {
  const settings = JSON.parse(readFileSync('.claude/settings.json', 'utf8'));

  for (const groups of Object.values(settings.hooks ?? {})) {
    for (const { command } of groups.flatMap((group) => group.hooks)) {
      for (const [, path] of command.matchAll(/\$CLAUDE_PROJECT_DIR\/([^"'\s]+)/g)) {
        if (!existsSync(path)) problems.push(`.claude/settings.json has a hook that runs ${path}, which does not exist.`);
      }
    }
  }
}

if (problems.length) {
  console.error('Agent skills that will not load:\n  ' + problems.join('\n  '));
  process.exit(1);
}

console.log('Agent skills: every one in .agents/skills and .claude/skills loads, and every hook finds its script.');
