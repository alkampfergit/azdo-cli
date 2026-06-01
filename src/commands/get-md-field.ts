import { Command } from 'commander';
import type { AzdoContext } from '../types/work-item.js';
import { getWorkItemFieldValue } from '../services/azdo-client.js';
import { requireAuthCredential } from '../services/auth.js';
import { resolveContext } from '../services/context.js';
import { toMarkdown } from '../services/md-convert.js';
import { parseWorkItemId, validateOrgProjectPair, handleCommandError } from '../services/command-helpers.js';
import {
  resolveImageDownloadOptions,
  downloadImagesFromFields,
  formatImageSummary,
} from '../services/image-download.js';

export function createGetMdFieldCommand(): Command {
  const command = new Command('get-md-field');

  command
    .description('Get a work item field value, converting HTML to markdown')
    .argument('<id>', 'work item ID')
    .argument('<field>', 'field reference name (e.g., System.Description)')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .option('--download-images', 'download images embedded in the field to local files')
    .option('--resize-images <pixels>', 'max image width in px; downloads and resizes embedded images to PNG (implies --download-images)')
    .option('--images-path <dir>', 'destination directory for downloaded images (default: system temp dir)')
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
        let imageOptions;
        try {
          imageOptions = resolveImageDownloadOptions({
            downloadImages: options.downloadImages,
            resizeImages: options.resizeImages,
            imagesPath: options.imagesPath,
          });
        } catch (err: unknown) {
          process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
          process.exit(1);
        }

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
            const results = await downloadImagesFromFields(
              [{ content: value ?? '', field }],
              { workItemId: id, options: imageOptions },
              credential,
            );
            process.stdout.write(formatImageSummary(results) + '\n');
            for (const result of results) {
              if (result.error) {
                process.stderr.write(`Failed to download image ${result.reference.url}: ${result.error}\n`);
              }
            }
          }
        } catch (err: unknown) {
          handleCommandError(err, id, context, 'read');
        }
      },
    );

  return command;
}
