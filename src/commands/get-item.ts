import { Command } from 'commander';
import type { AzdoContext, WorkItem } from '../types/work-item.js';
import { getWorkItem } from '../services/azdo-client.js';
import { resolvePat } from '../services/auth.js';
import { detectAzdoContext } from '../services/git-remote.js';

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

export function formatWorkItem(workItem: WorkItem, short: boolean): string {
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
    .action(
      async (
        idStr: string,
        options: { org?: string; project?: string; short?: boolean },
      ) => {
        // Step 1 — Validate ID
        const id = parseInt(idStr, 10);
        if (!Number.isInteger(id) || id <= 0) {
          process.stderr.write(
            `Error: Work item ID must be a positive integer. Got: "${idStr}"\n`,
          );
          process.exit(1);
        }

        // Step 2 — Validate org/project pair
        const hasOrg = options.org !== undefined;
        const hasProject = options.project !== undefined;
        if (hasOrg !== hasProject) {
          process.stderr.write(
            'Error: --org and --project must both be provided, or both omitted.\n',
          );
          process.exit(1);
        }

        let context: AzdoContext;

        try {
          // Step 3 — Resolve context
          if (options.org && options.project) {
            context = { org: options.org, project: options.project };
          } else {
            context = detectAzdoContext();
          }

          // Step 4 — Resolve PAT
          const credential = await resolvePat();

          // Step 5 — Fetch work item
          const workItem = await getWorkItem(context, id, credential.pat);

          // Step 6 — Display output
          const output = formatWorkItem(workItem, options.short ?? false);
          process.stdout.write(output + '\n');
        } catch (err: unknown) {
          const error = err instanceof Error ? err : new Error(String(err));
          const msg = error.message;

          if (msg === 'AUTH_FAILED') {
            process.stderr.write(
              'Error: Authentication failed. Check that your PAT is valid and has the "Work Items (read)" scope.\n',
            );
          } else if (msg === 'NOT_FOUND') {
            process.stderr.write(
              `Error: Work item ${id} not found in ${context!.org}/${context!.project}.\n`,
            );
          } else if (msg === 'PERMISSION_DENIED') {
            process.stderr.write(
              `Error: Access denied. Your PAT may lack permissions for project "${context!.project}".\n`,
            );
          } else if (msg === 'NETWORK_ERROR') {
            process.stderr.write(
              'Error: Could not connect to Azure DevOps. Check your network connection.\n',
            );
          } else if (
            msg.includes('Not in a git repository') ||
            msg.includes('is not an Azure DevOps URL') ||
            msg.includes('Authentication cancelled')
          ) {
            process.stderr.write(`Error: ${msg}\n`);
          } else {
            process.stderr.write(`Error: ${msg}\n`);
          }

          process.exit(1);
        }
      },
    );

  return command;
}
