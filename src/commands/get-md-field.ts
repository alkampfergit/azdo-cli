import { Command } from 'commander';
import type { AzdoContext } from '../types/work-item.js';
import { getWorkItemFieldValue } from '../services/azdo-client.js';
import { resolvePat } from '../services/auth.js';
import { resolveContext } from '../services/context.js';
import { toMarkdown } from '../services/md-convert.js';
import { parseWorkItemId, validateOrgProjectPair, handleCommandError } from '../services/command-helpers.js';

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
        const id = parseWorkItemId(idStr);
        validateOrgProjectPair(options);

        let context: AzdoContext | undefined;

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
          handleCommandError(err, id, context, 'read');
        }
      },
    );

  return command;
}
