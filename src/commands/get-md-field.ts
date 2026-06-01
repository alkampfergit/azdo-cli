import { Command } from 'commander';
import type { AzdoContext } from '../types/work-item.js';
import { getWorkItemFieldValue } from '../services/azdo-client.js';
import { requireAuthCredential } from '../services/auth.js';
import { resolveContext } from '../services/context.js';
import { toMarkdown } from '../services/md-convert.js';
import { parseWorkItemId, validateOrgProjectPair, handleCommandError } from '../services/command-helpers.js';
import {
  addImageDownloadOptions,
  resolveImageDownloadOptionsOrExit,
  runImageDownload,
} from '../services/image-download.js';

export function createGetMdFieldCommand(): Command {
  const command = new Command('get-md-field');

  command
    .description('Get a work item field value, converting HTML to markdown')
    .argument('<id>', 'work item ID')
    .argument('<field>', 'field reference name (e.g., System.Description)')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project');
  addImageDownloadOptions(command);
  command
    .action(
      async (
        idStr: string,
        field: string,
        options: {
          org?: string;
          project?: string;
          downloadImages?: boolean;
          resizeImages?: string;
          imagesPath?: string;
        },
      ) => {
        const id = parseWorkItemId(idStr);
        validateOrgProjectPair(options);

        // Resolve image options first so invalid input fails fast before any network call.
        const imageOptions = resolveImageDownloadOptionsOrExit(options);

        let context: AzdoContext | undefined;

        try {
          context = resolveContext(options);
          const credential = await requireAuthCredential(context.org);

          const value = await getWorkItemFieldValue(context, id, credential, field);

          if (value === null) {
            process.stdout.write('\n');
          } else {
            process.stdout.write(toMarkdown(value) + '\n');
          }

          if (imageOptions.enabled) {
            await runImageDownload(
              [{ content: value ?? '', field }],
              { workItemId: id, options: imageOptions },
              credential,
            );
          }
        } catch (err: unknown) {
          handleCommandError(err, id, context, 'read');
        }
      },
    );

  return command;
}
