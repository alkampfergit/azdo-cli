import { Command } from 'commander';
import type { AzdoContext } from '../types/work-item.js';
import { deleteWorkItem } from '../services/azdo-client.js';
import { requireAuthCredential } from '../services/auth.js';
import { resolveContext } from '../services/context.js';
import {
  parseWorkItemId,
  validateOrgProjectPair,
  handleCommandError,
  promptYesNo,
} from '../services/command-helpers.js';

export function createDeleteItemCommand(): Command {
  const command = new Command('delete-item');

  command
    .description('Delete an Azure DevOps work item (moves it to the Recycle Bin unless --permanent)')
    .argument('<id>', 'work item ID')
    .option('--permanent', 'destroy the work item permanently instead of moving it to the Recycle Bin')
    .option('-y, --yes', 'skip the interactive confirmation prompt')
    .option('--json', 'output { id, permanent, deleted }')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .action(
      async (
        idStr: string,
        options: { permanent?: boolean; yes?: boolean; json?: boolean; org?: string; project?: string },
      ) => {
        const id = parseWorkItemId(idStr);
        validateOrgProjectPair(options);
        const permanent = options.permanent === true;

        let context: AzdoContext | undefined;

        try {
          context = resolveContext(options);
          const credential = await requireAuthCredential(context.org);

          let confirmed = options.yes === true;
          if (!confirmed) {
            if (!process.stdin.isTTY) {
              process.stderr.write(
                'Error: confirmation required. Re-run with --yes to skip the prompt in a non-interactive shell.\n',
              );
              process.exitCode = 1;
              return;
            }
            const question = permanent
              ? `Permanently delete work item ${id}? This cannot be undone. [y/N] `
              : `Delete work item ${id} (moves it to the Recycle Bin)? [y/N] `;
            confirmed = await promptYesNo(question);
          }

          if (!confirmed) {
            process.stderr.write('Aborted: work item not deleted.\n');
            process.exitCode = 1;
            return;
          }

          await deleteWorkItem(context, id, credential, permanent);

          if (options.json) {
            process.stdout.write(`${JSON.stringify({ id, permanent, deleted: true }, null, 2)}\n`);
          } else {
            process.stdout.write(
              permanent ? `Permanently deleted work item ${id}\n` : `Deleted work item ${id}\n`,
            );
          }
        } catch (err: unknown) {
          handleCommandError(err, id, context, 'write');
        }
      },
    );

  return command;
}
