import { Command } from 'commander';
import type { AzdoContext, WorkItemSummary } from '../types/work-item.js';
import { queryWorkItems } from '../services/azdo-client.js';
import { requireAuthCredential } from '../services/auth.js';
import { resolveContext } from '../services/context.js';
import { toMarkdown } from '../services/md-convert.js';
import { validateOrgProjectPair, handleCommandError } from '../services/command-helpers.js';

const DEFAULT_TOP = 50;
// WIQL rejects a result set above 20000 items; keep the cap well inside it.
const MAX_TOP = 1000;

interface ListItemsOptions {
  org?: string;
  project?: string;
  state?: string;
  tag?: string;
  assignedTo?: string;
  titleContains?: string;
  top?: string;
  json?: boolean;
}

export function parseTop(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_TOP;
  const top = Number(raw);
  if (!/^\d+$/.test(raw) || top < 1 || top > MAX_TOP) {
    process.stderr.write(`Error: --top must be an integer between 1 and ${MAX_TOP}. Got: "${raw}"\n`);
    process.exit(1);
  }
  return top;
}

/** The `--json` row: description as markdown ('' when the item has none). */
export function toJsonRow(item: WorkItemSummary): Record<string, unknown> {
  return {
    id: item.id,
    title: item.title,
    description: item.description ? toMarkdown(item.description) : '',
    url: item.url,
    state: item.state,
    tags: item.tags,
    assignedTo: item.assignedTo,
  };
}

export function formatItemLine(item: WorkItemSummary): string {
  const tags = item.tags.length > 0 ? `  [${item.tags.join(', ')}]` : '';
  return `${item.id}\t${item.state}\t${item.assignedTo ?? 'Unassigned'}\t${item.title}${tags}`;
}

export function createListItemsCommand(): Command {
  const command = new Command('list-items');

  command
    .description('List work items filtered by state, tag, assignee and title (one WIQL query, then batched reads of 200 items)')
    .option('--state <state>', 'only items in this state (e.g. "Active")')
    .option('--tag <tag>', 'only items carrying this tag')
    .option('--assigned-to <user>', 'only items assigned to this user (display name, email, or @me)')
    .option('--title-contains <text>', 'only items whose title contains this text')
    .option('--top <n>', `maximum number of items, newest change first (default ${DEFAULT_TOP}, max ${MAX_TOP})`)
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .option('--json', 'output an array of { id, title, description (markdown), url, state, tags, assignedTo }')
    .action(async (options: ListItemsOptions) => {
      validateOrgProjectPair(options);
      const top = parseTop(options.top);

      let context: AzdoContext | undefined;
      try {
        context = resolveContext(options);
        const credential = await requireAuthCredential(context.org);
        const items = await queryWorkItems(context, credential, {
          state: options.state,
          tag: options.tag,
          assignedTo: options.assignedTo,
          titleContains: options.titleContains,
          top,
        });

        if (options.json) {
          process.stdout.write(JSON.stringify(items.map(toJsonRow)) + '\n');
        } else if (items.length === 0) {
          process.stdout.write('No work items found.\n');
        } else {
          process.stdout.write(items.map(formatItemLine).join('\n') + '\n');
        }
      } catch (err: unknown) {
        handleCommandError(err, undefined, context, 'read');
      }
    });

  return command;
}
