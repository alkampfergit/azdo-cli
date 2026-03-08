import { Command } from 'commander';
import type { AzdoContext } from '../types/work-item.js';
import { updateWorkItem } from '../services/azdo-client.js';
import { resolvePat } from '../services/auth.js';
import { resolveContext } from '../services/context.js';
import { parseWorkItemId, validateOrgProjectPair, handleCommandError } from '../services/command-helpers.js';

export function createSetStateCommand(): Command {
  const command = new Command('set-state');

  command
    .description('Change the state of a work item')
    .argument('<id>', 'work item ID')
    .argument('<state>', 'target state (e.g., "Active", "Closed")')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .option('--json', 'output result as JSON')
    .action(
      async (
        idStr: string,
        state: string,
        options: { org?: string; project?: string; json?: boolean },
      ) => {
        const id = parseWorkItemId(idStr);
        validateOrgProjectPair(options);

        let context: AzdoContext | undefined;

        try {
          context = resolveContext(options);
          const credential = await resolvePat();

          const operations = [
            { op: 'add' as const, path: '/fields/System.State', value: state },
          ];

          const result = await updateWorkItem(context, id, credential.pat, 'System.State', operations);

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
            process.stdout.write(`Updated work item ${result.id}: State -> ${state}\n`);
          }
        } catch (err: unknown) {
          handleCommandError(err, id, context, 'write');
        }
      },
    );

  return command;
}
