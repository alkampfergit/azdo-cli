import { Command } from 'commander';
import type { AzdoContext } from '../types/work-item.js';
import { updateWorkItem } from '../services/azdo-client.js';
import { resolvePat } from '../services/auth.js';
import { resolveContext } from '../services/context.js';
import { parseWorkItemId, validateOrgProjectPair, handleCommandError } from '../services/command-helpers.js';

export function createAssignCommand(): Command {
  const command = new Command('assign');

  command
    .description('Assign a work item to a user, or unassign it')
    .argument('<id>', 'work item ID')
    .argument('[name]', 'user display name or email')
    .option('--unassign', 'clear the Assigned To field')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .option('--json', 'output result as JSON')
    .action(
      async (
        idStr: string,
        name: string | undefined,
        options: { unassign?: boolean; org?: string; project?: string; json?: boolean },
      ) => {
        const id = parseWorkItemId(idStr);

        if (!name && !options.unassign) {
          process.stderr.write(
            'Error: Either provide a user name or use --unassign.\n',
          );
          process.exit(1);
        }

        if (name && options.unassign) {
          process.stderr.write(
            'Error: Cannot provide both a user name and --unassign.\n',
          );
          process.exit(1);
        }

        validateOrgProjectPair(options);

        let context: AzdoContext | undefined;

        try {
          context = resolveContext(options);
          const credential = await resolvePat();

          const value = options.unassign ? '' : name!;
          const operations = [
            { op: 'add' as const, path: '/fields/System.AssignedTo', value },
          ];

          const result = await updateWorkItem(context, id, credential.pat, 'System.AssignedTo', operations);

          if (options.json) {
            process.stdout.write(
              JSON.stringify({
                id: result.id,
                rev: result.rev,
                title: result.title,
                field: result.fieldName,
                value: result.fieldValue,
              }) + '\n',
            );
          } else {
            const displayValue = options.unassign ? '(unassigned)' : name!;
            process.stdout.write(`Updated work item ${result.id}: Assigned To -> ${displayValue}\n`);
          }
        } catch (err: unknown) {
          handleCommandError(err, id, context, 'write');
        }
      },
    );

  return command;
}
