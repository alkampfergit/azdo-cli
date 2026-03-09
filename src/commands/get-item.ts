import { Command } from 'commander';
import type { AzdoContext, WorkItem } from '../types/work-item.js';
import { getWorkItem } from '../services/azdo-client.js';
import { resolvePat } from '../services/auth.js';
import { resolveContext } from '../services/context.js';
import { loadConfig } from '../services/config-store.js';
import { parseWorkItemId, validateOrgProjectPair, handleCommandError } from '../services/command-helpers.js';

export function parseRequestedFields(raw?: string | string[]): string[] | undefined {
  if (raw === undefined) return undefined;

  const source = Array.isArray(raw) ? raw : [raw];
  const tokens = source
    .flatMap((entry) => entry.split(/[,\s]+/))
    .map((field) => field.trim())
    .filter((field) => field.length > 0);

  if (tokens.length === 0) return undefined;

  return Array.from(new Set(tokens));
}

export function stripHtml(html: string): string {
  let text = html;

  // Replace headings with labeled newlines
  text = text.replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n--- $1 ---\n');

  // Replace block-level and line-breaking tags with newlines first
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/?(p|div)>/gi, '\n');
  text = text.replace(/<li>/gi, '\n');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]*>/g, '');

  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');

  // Collapse multiple consecutive newlines into double newline
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

export function formatWorkItem(workItem: WorkItem, short: boolean, markdown: boolean = false): string {
  const lines: string[] = [];
  const label = (name: string): string => name.padEnd(13);

  lines.push(`${label('ID:')}${workItem.id}`);
  lines.push(`${label('Type:')}${workItem.type}`);
  lines.push(`${label('Title:')}${workItem.title}`);
  lines.push(`${label('State:')}${workItem.state}`);
  lines.push(`${label('Assigned To:')}${workItem.assignedTo ?? 'Unassigned'}`);

  if (!short) {
    lines.push(`${label('Area:')}${workItem.areaPath}`);
    lines.push(`${label('Iteration:')}${workItem.iterationPath}`);
  }

  lines.push(`${label('URL:')}${workItem.url}`);

  if (workItem.extraFields) {
    for (const [refName, value] of Object.entries(workItem.extraFields)) {
      const fieldLabel = refName.includes('.') ? refName.split('.').pop()! : refName;
      lines.push(`${fieldLabel.padEnd(13)}${value}`);
    }
  }

  lines.push('');

  const descriptionText = workItem.description
    ? stripHtml(workItem.description)
    : '';

  if (short) {
    const descLines = descriptionText.split('\n').filter((l) => l.trim() !== '');
    const firstThree = descLines.slice(0, 3);
    const truncated = descLines.length > 3;
    const descSummary = firstThree.join('\n') + (truncated ? '\n...' : '');
    lines.push(`${label('Description:')}${descSummary}`);
  } else {
    lines.push('Description:');
    lines.push(descriptionText);
  }

  return lines.join('\n');
}

export function createGetItemCommand(): Command {
  const command = new Command('get-item');

  command
    .description('Retrieve an Azure DevOps work item by ID')
    .argument('<id>', 'work item ID')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .option('--short', 'show abbreviated output')
    .option('--fields <fields>', 'comma-separated additional field reference names')
    .action(
      async (
        idStr: string,
        options: { org?: string; project?: string; short?: boolean; fields?: string },
      ) => {
        const id = parseWorkItemId(idStr);
        validateOrgProjectPair(options);

        let context: AzdoContext | undefined;

        try {
          context = resolveContext(options);
          const credential = await resolvePat();

          const fieldsList = options.fields !== undefined
            ? parseRequestedFields(options.fields)
            : parseRequestedFields(loadConfig().fields);

          const workItem = await getWorkItem(context, id, credential.pat, fieldsList);

          const output = formatWorkItem(workItem, options.short ?? false);
          process.stdout.write(output + '\n');
        } catch (err: unknown) {
          handleCommandError(err, id, context, 'read', false);
        }
      },
    );

  return command;
}
