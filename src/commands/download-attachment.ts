import { Command } from 'commander';
import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AzdoContext } from '../types/work-item.js';
import { getWorkItem, downloadAttachment } from '../services/azdo-client.js';
import { resolvePat } from '../services/auth.js';
import { resolveContext } from '../services/context.js';
import { parseWorkItemId, validateOrgProjectPair, handleCommandError } from '../services/command-helpers.js';
import { formatFileSize } from './get-item.js';

export function createDownloadAttachmentCommand(): Command {
  const command = new Command('download-attachment');

  command
    .description('Download an attachment from an Azure DevOps work item')
    .argument('<id>', 'work item ID')
    .argument('<filename>', 'name of the attachment to download')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .option('--output <dir>', 'target directory for the downloaded file')
    .action(
      async (
        idStr: string,
        filename: string,
        options: { org?: string; project?: string; output?: string },
      ) => {
        const id = parseWorkItemId(idStr);
        validateOrgProjectPair(options);

        let context: AzdoContext | undefined;

        try {
          context = resolveContext(options);
          const credential = await resolvePat();

          const outputDir = options.output ?? '.';
          if (!existsSync(outputDir)) {
            process.stderr.write(`Error: Output directory "${outputDir}" does not exist.\n`);
            process.exit(1);
          }

          const workItem = await getWorkItem(context, id, credential.pat);

          const attachment = workItem.attachments?.find(
            (a) => a.name === filename,
          );

          if (!attachment) {
            process.stderr.write(
              `Error: Attachment "${filename}" not found on work item ${id}.\n`,
            );
            process.exit(1);
          }

          const data = await downloadAttachment(attachment.url, credential.pat);
          const outputPath = join(outputDir, filename);
          await writeFile(outputPath, Buffer.from(data));

          process.stdout.write(
            `Downloaded "${filename}" (${formatFileSize(attachment.size)}) to ${outputPath}\n`,
          );
        } catch (err: unknown) {
          handleCommandError(err, id, context, 'read', false);
        }
      },
    );

  return command;
}
