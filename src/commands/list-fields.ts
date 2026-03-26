import { Command } from 'commander';
import type { AzdoContext } from '../types/work-item.js';
import { getWorkItemFields } from '../services/azdo-client.js';
import { resolvePat } from '../services/auth.js';
import { resolveContext } from '../services/context.js';
import { parseWorkItemId, validateOrgProjectPair, handleCommandError } from '../services/command-helpers.js';

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function formatFieldList(fields: Record<string, unknown>): string {
  const entries = Object.entries(fields)
    .sort(([a], [b]) => a.localeCompare(b));

  const maxKeyLen = Math.min(
    Math.max(...entries.map(([k]) => k.length)),
    50,
  );

  return entries
    .map(([key, value]) => {
      const display = stringifyValue(value);
      const truncated = display.length > 120 ? display.slice(0, 117) + '...' : display;
      return `${key.padEnd(maxKeyLen + 2)}${truncated}`;
    })
    .join('\n');
}

export function createListFieldsCommand(): Command {
  const command = new Command('list-fields');

  command
    .description('List all fields of an Azure DevOps work item')
    .argument('<id>', 'work item ID')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .option('--json', 'output result as JSON')
    .action(
      async (
        idStr: string,
        options: { org?: string; project?: string; json?: boolean },
      ) => {
        const id = parseWorkItemId(idStr);
        validateOrgProjectPair(options);

        let context: AzdoContext | undefined;

        try {
          context = resolveContext(options);
          const credential = await resolvePat();

          const fields = await getWorkItemFields(context, id, credential.pat);

          if (options.json) {
            process.stdout.write(JSON.stringify({ id, fields }, null, 2) + '\n');
          } else {
            process.stdout.write(`Work Item ${id} — ${Object.keys(fields).length} fields\n\n`);
            process.stdout.write(formatFieldList(fields) + '\n');
          }
        } catch (err: unknown) {
          handleCommandError(err, id, context, 'read');
        }
      },
    );

  return command;
}
