import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Command } from 'commander';
import { createProgram } from '../../src/program.js';

// docs/commands.md is the single command reference (and what external doc
// indexes such as Context7 read). This suite walks the REAL command tree from
// createProgram() so a new command, alias or option cannot ship without the
// reference mentioning it, and a removed command cannot linger in it.
const reference = readFileSync(
  fileURLToPath(new URL('../../docs/commands.md', import.meta.url)),
  'utf8',
);

interface CommandEntry {
  path: string;
  command: Command;
}

function walk(command: Command, prefix: string[]): CommandEntry[] {
  return command.commands.flatMap((sub) => {
    const path = [...prefix, sub.name()];
    const entries: CommandEntry[] = [{ path: path.join(' '), command: sub }];
    for (const alias of sub.aliases()) {
      entries.push({ path: [...prefix, alias].join(' '), command: sub });
    }
    return [...entries, ...walk(sub, path)];
  });
}

const entries = walk(createProgram(), ['azdo']);
const commands = entries.filter((entry, index) => entries.findIndex((e) => e.command === entry.command) === index);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A command path counts as documented only when it appears as a complete
// path — not merely as the prefix of one of its own subcommands, so
// `azdo pr comments add` alone cannot satisfy `azdo pr comments`.
function mentionsCommand({ path, command }: CommandEntry): boolean {
  const children = command.commands.flatMap((sub) => [sub.name(), ...sub.aliases()]).map(escapeRegExp);
  const notAChild = children.length > 0 ? `(?! (?:${children.join('|')})(?![\\w-]))` : '';
  return new RegExp(`${escapeRegExp(path)}(?![\\w-])${notAChild}`).test(reference);
}

describe('docs/commands.md', () => {
  it.each(entries.map((entry) => [entry.path, entry] as const))('mentions `%s`', (path, entry) => {
    expect(mentionsCommand(entry), `docs/commands.md never mentions \`${path}\` as a complete command`).toBe(true);
  });

  const options = [
    ...new Set(
      commands.flatMap(({ command }) => command.options.map((option) => option.long).filter((flag): flag is string => !!flag)),
    ),
  ].sort();

  it.each(options)('documents the %s option', (flag) => {
    const documented = new RegExp(`${escapeRegExp(flag)}(?![\\w-])`).test(reference);
    expect(documented, `docs/commands.md never mentions ${flag}`).toBe(true);
  });

  it.each(['azdo login', 'azdo work-item', 'azdo boards'])('does not present the removed command `%s` as usable', (stale) => {
    const lines = reference.split('\n').filter((line) => line.includes(stale));
    for (const line of lines) {
      expect(/does not exist/.test(line), `stale command presented as usable: ${line}`).toBe(true);
    }
  });
});
