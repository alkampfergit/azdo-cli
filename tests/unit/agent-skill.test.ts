import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Command } from 'commander';
import { createProgram } from '../../src/program.js';

// The agent skill (skills/azdo/) ships with the CLI and is what an agent
// follows to the letter. This suite walks every `azdo …` invocation in it
// against the REAL command tree from createProgram(), so a renamed command or
// option cannot leave the skill teaching something that no longer exists.
const skillDir = fileURLToPath(new URL('../../skills/azdo/', import.meta.url));
const files = ['SKILL.md', ...readdirSync(join(skillDir, 'references')).map((name) => `references/${name}`)];
const program = createProgram();

// Commands that SKILL.md names as non-existent on purpose.
const MISSING_ON_PURPOSE = new Set(['login', 'work-item', 'boards']);

interface Invocation {
  file: string;
  text: string;
}

// `azdo …` inside fenced code blocks (one per line) and inline code spans.
function invocations(file: string): Invocation[] {
  const source = readFileSync(join(skillDir, file), 'utf8');
  const found: Invocation[] = [];
  let fenced = false;
  for (const line of source.split('\n')) {
    if (line.startsWith('```')) {
      fenced = !fenced;
    } else if (fenced) {
      for (const match of line.matchAll(/(?:^|[\s(|;&$])(azdo\s[^|;&)#]*)/g)) found.push({ file, text: match[1] });
    } else {
      for (const match of line.matchAll(/`(azdo\s[^`]*)`/g)) found.push({ file, text: match[1] });
    }
  }
  return found;
}

function findSub(command: Command, name: string): Command | undefined {
  return command.commands.find((sub) => sub.name() === name || sub.aliases().includes(name));
}

function knownFlags(chain: Command[]): Set<string> {
  const flags = new Set(['--help']);
  for (const command of chain) {
    for (const option of command.options) {
      if (option.long) flags.add(option.long);
      if (option.short) flags.add(option.short);
    }
  }
  return flags;
}

// Returns a problem description, or null when the invocation is valid.
function check(text: string): string | null {
  const tokens = text.trim().split(/\s+/).slice(1);
  const chain: Command[] = [program];
  let index = 0;
  // Root options may precede the subcommand (`azdo --trace ./t.log get-item 1`).
  while (tokens[index]?.startsWith('-')) {
    const option = program.options.find((o) => o.long === tokens[index]);
    if (!option) return `unknown root option ${tokens[index]}`;
    index += option.required || option.optional ? 2 : 1;
  }
  for (; index < tokens.length; index++) {
    const sub = findSub(chain.at(-1)!, tokens[index]);
    if (!sub) break;
    chain.push(sub);
  }
  const target = chain.at(-1)!;
  if (target === program) {
    const name = tokens[index];
    if (name === undefined || name.startsWith('<') || MISSING_ON_PURPOSE.has(name)) return null;
    return `unknown command ${name}`;
  }
  const next = tokens[index];
  const takesWords = target.registeredArguments.length > 0 || target.commands.length === 0;
  if (next !== undefined && !next.startsWith('-') && !next.startsWith('<') && !takesWords) {
    return `\`${chain.map((c) => c.name()).join(' ')}\` has no subcommand ${next}`;
  }
  const flags = knownFlags(chain);
  for (const token of tokens.slice(index)) {
    const flag = token.split('=')[0];
    if (/^--?[a-z]/.test(flag) && !flags.has(flag)) return `\`${chain.map((c) => c.name()).join(' ')}\` has no ${flag}`;
  }
  return null;
}

const all = files.flatMap(invocations);

describe('agent skill (skills/azdo)', () => {
  it('names at least one command per file', () => {
    for (const file of files) {
      expect(all.some((entry) => entry.file === file), `${file} names no azdo command`).toBe(true);
    }
  });

  it.each(all.map((entry) => [`${entry.file}: ${entry.text.trim()}`, entry.text] as const))(
    '%s',
    (_label, text) => {
      expect(check(text)).toBeNull();
    },
  );

  it('links every reference file from SKILL.md, and only existing ones', () => {
    const skill = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
    const linked = new Set([...skill.matchAll(/`(references\/[\w-]+\.md)`/g)].map((m) => m[1]));
    expect([...linked].sort()).toEqual(files.filter((f) => f !== 'SKILL.md').sort());
  });

  it('starts with name and description front matter', () => {
    const skill = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
    expect(skill).toMatch(/^---\nname: azdo\ndescription: .+\n---\n/);
  });

  it('flags a command that does not exist (self-check)', () => {
    expect(check('azdo pr merge')).toMatch(/no subcommand merge/);
    expect(check('azdo frobnicate')).toMatch(/unknown command/);
    expect(check('azdo pr list --no-such-flag')).not.toBeNull();
    expect(check('azdo pr list --branch x --json')).toBeNull();
  });
});
