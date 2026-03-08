import { Command } from 'commander';
import type { AzdoContext } from '../types/work-item.js';
import { getWorkItemFieldValue } from '../services/azdo-client.js';
import { resolvePat } from '../services/auth.js';
import { resolveContext } from '../services/context.js';
import { toMarkdown } from '../services/md-convert.js';

export function createGetMdFieldCommand(): Command {
  const command = new Command('get-md-field');

  command
    .description('Get a work item field value, converting HTML to markdown')
    .argument('<id>', 'work item ID')
    .argument('<field>', 'field reference name (e.g., System.Description)')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .action(
      async (
        idStr: string,
        field: string,
        options: { org?: string; project?: string },
      ) => {
        const id = Number.parseInt(idStr, 10);
        if (!Number.isInteger(id) || id <= 0) {
          process.stderr.write(
            `Error: Work item ID must be a positive integer. Got: "${idStr}"\n`,
          );
          process.exit(1);
        }

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
          context = resolveContext(options);
          const credential = await resolvePat();

          const value = await getWorkItemFieldValue(context, id, credential.pat, field);

          if (value === null) {
            process.stdout.write('\n');
          } else {
            process.stdout.write(toMarkdown(value) + '\n');
          }
        } catch (err: unknown) {
          const error = err instanceof Error ? err : new Error(String(err));
          const msg = error.message;

          if (msg === 'AUTH_FAILED') {
            process.stderr.write(
              'Error: Authentication failed. Check that your PAT is valid and has the "Work Items (Read)" scope.\n',
            );
          } else if (msg === 'PERMISSION_DENIED') {
            process.stderr.write(
              `Error: Access denied. Your PAT may lack read permissions for project "${context!.project}".\n`,
            );
          } else if (msg === 'NOT_FOUND') {
            process.stderr.write(
              `Error: Work item ${id} not found in ${context!.org}/${context!.project}.\n`,
            );
          } else if (msg === 'NETWORK_ERROR') {
            process.stderr.write(
              'Error: Could not connect to Azure DevOps. Check your network connection.\n',
            );
          } else {
            process.stderr.write(`Error: ${msg}\n`);
          }

          process.exit(1);
        }
      },
    );

  return command;
}
