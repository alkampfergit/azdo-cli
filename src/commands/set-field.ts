import { Command } from 'commander';
import type { AzdoContext } from '../types/work-item.js';
import { updateWorkItem } from '../services/azdo-client.js';
import { resolvePat } from '../services/auth.js';
import { resolveContext } from '../services/context.js';
import { parseWorkItemId, validateOrgProjectPair, handleCommandError } from '../services/command-helpers.js';

export function createSetFieldCommand(): Command {
  const command = new Command('set-field');

  command
    .description('Set any work item field by its reference name')
    .argument('<id>', 'work item ID')
    .argument('<field>', 'field reference name (e.g., System.Title)')
    .argument('<value>', 'new value for the field')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .option('--json', 'output result as JSON')
    .action(
      async (
        idStr: string,
        field: string,
        value: string,
        options: { org?: string; project?: string; json?: boolean },
      ) => {
        const id = parseWorkItemId(idStr);
        validateOrgProjectPair(options);

        let context: AzdoContext | undefined;

        try {
          context = resolveContext(options);
          const credential = await resolvePat();

          const operations = [
            { op: 'add' as const, path: `/fields/${field}`, value },
          ];

          const result = await updateWorkItem(context, id, credential.pat, field, operations);

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
            process.stdout.write(`Updated work item ${result.id}: ${field} -> ${value}\n`);
          }
        } catch (err: unknown) {
          handleCommandError(err, id, context, 'write');
        }
      },
    );

  return command;
}
