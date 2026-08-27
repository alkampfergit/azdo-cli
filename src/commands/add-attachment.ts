import { Command } from 'commander';
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { AzdoContext } from '../types/work-item.js';
import { createAttachment, applyWorkItemPatch, getWorkItem } from '../services/azdo-client.js';
import { requireAuthCredential } from '../services/auth.js';
import { resolveContext } from '../services/context.js';
import { parseWorkItemId, validateOrgProjectPair, handleCommandError } from '../services/command-helpers.js';
import { formatFileSize } from './get-item.js';

export function createAddAttachmentCommand(): Command {
  const command = new Command('add-attachment');

  command
    .description('Attach a local file to an Azure DevOps work item')
    .argument('<id>', 'work item ID')
    .argument('<file>', 'path to the local file to upload')
    .option('--comment <text>', 'optional comment to store with the attachment')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .action(
      async (
        idStr: string,
        file: string,
        options: { comment?: string; org?: string; project?: string },
      ) => {
        const id = parseWorkItemId(idStr);
        validateOrgProjectPair(options);

        if (!existsSync(file)) {
          process.stderr.write(`Error: File not found: ${file}\n`);
          process.exit(1);
        }
        if (!statSync(file).isFile()) {
          process.stderr.write(`Error: "${file}" is not a regular file.\n`);
          process.exit(1);
        }

        let context: AzdoContext | undefined;

        try {
          // Read the file before any network call (FR-003) — resolving the
          // credential can itself make a network call (e.g. an OAuth token
          // refresh), so an unreadable file must fail before that happens.
          const filename = basename(file);
          const content = await readFile(file);

          context = resolveContext(options);
          const credential = await requireAuthCredential(context.org);

          // Validate the work item is resolvable/writable before uploading —
          // otherwise an invalid/inaccessible work item ID leaves an
          // orphaned, unlinked attachment blob after the later link fails.
          await getWorkItem(context, id, credential);

          const attachment = await createAttachment(context, filename, content, credential);

          await applyWorkItemPatch(context, id, credential, [
            {
              op: 'add',
              path: '/relations/-',
              value: {
                rel: 'AttachedFile',
                url: attachment.url,
                ...(options.comment ? { attributes: { comment: options.comment } } : {}),
              },
            },
          ]);

          process.stdout.write(
            `Attached "${filename}" (${formatFileSize(content.length)}) to work item ${id} [id: ${attachment.id}]\n`,
          );
        } catch (err: unknown) {
          handleCommandError(err, id, context, 'write');
        }
      },
    );

  return command;
}
