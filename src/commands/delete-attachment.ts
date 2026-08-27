import { Command } from 'commander';
import type { AzdoContext } from '../types/work-item.js';
import { findAttachmentRelations, applyWorkItemPatch } from '../services/azdo-client.js';
import { requireAuthCredential } from '../services/auth.js';
import { resolveContext } from '../services/context.js';
import {
  parseWorkItemId,
  validateOrgProjectPair,
  handleCommandError,
  promptYesNo,
} from '../services/command-helpers.js';
import { formatFileSize } from './get-item.js';

function formatUploadDate(iso?: string): string {
  return iso ? iso.slice(0, 10) : 'unknown date';
}

export function createDeleteAttachmentCommand(): Command {
  const command = new Command('delete-attachment');

  command
    .description('Remove an attachment from an Azure DevOps work item')
    .argument('<id>', 'work item ID')
    .argument('<filename>', 'name of the attachment to remove')
    .option('--id <attachmentId>', 'attachment GUID, to disambiguate when the filename is shared by more than one attachment')
    .option('-y, --yes', 'skip the interactive confirmation prompt')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .action(
      async (
        idStr: string,
        filename: string,
        options: { id?: string; yes?: boolean; org?: string; project?: string },
      ) => {
        const id = parseWorkItemId(idStr);
        validateOrgProjectPair(options);

        let context: AzdoContext | undefined;

        try {
          context = resolveContext(options);
          const credential = await requireAuthCredential(context.org);

          const matches = await findAttachmentRelations(context, id, credential, filename);

          if (matches.length === 0) {
            process.stderr.write(`Error: Attachment "${filename}" not found on work item ${id}.\n`);
            process.exitCode = 1;
            return;
          }

          let target: (typeof matches)[number];

          if (options.id) {
            // Validate an explicit --id against every match, regardless of
            // how many candidates there are — otherwise a single-match
            // filename would silently ignore a caller-supplied --id that
            // doesn't actually belong to that attachment.
            const wantedId = options.id.toLowerCase();
            const narrowed = matches.find((match) => match.id === wantedId);
            if (!narrowed) {
              process.stderr.write(
                `Error: No attachment named "${filename}" with id ${options.id} found on work item ${id}.\n`,
              );
              process.exitCode = 1;
              return;
            }
            target = narrowed;
          } else if (matches.length > 1) {
            process.stderr.write(
              `Error: multiple attachments named "${filename}" on work item ${id}:\n`,
            );
            for (const match of matches) {
              process.stderr.write(
                `  ${match.id}  ${formatFileSize(match.size)}  ${formatUploadDate(match.uploadedDate)}\n`,
              );
            }
            process.stderr.write('Re-run with --id <guid> to remove a specific one.\n');
            process.exitCode = 1;
            return;
          } else {
            target = matches[0];
          }

          let confirmed = options.yes === true;
          if (!confirmed) {
            if (!process.stdin.isTTY) {
              process.stderr.write(
                'Error: confirmation required. Re-run with --yes to skip the prompt in a non-interactive shell.\n',
              );
              process.exitCode = 1;
              return;
            }
            confirmed = await promptYesNo(`Remove "${filename}" from work item ${id}? [y/N] `);
          }

          if (!confirmed) {
            process.stderr.write('Aborted: attachment not removed.\n');
            process.exitCode = 1;
            return;
          }

          // The relation index was resolved before the (potentially
          // long-running, interactive) confirmation prompt — another client
          // could have inserted/removed an earlier relation meanwhile and
          // shifted it. Guard the removal with a `test` op asserting the
          // relation at that index is still the one we found, so a stale
          // index is rejected by the server instead of removing the wrong
          // attachment.
          await applyWorkItemPatch(context, id, credential, [
            { op: 'test', path: `/relations/${target.index}/url`, value: target.url },
            { op: 'remove', path: `/relations/${target.index}` },
          ]);

          process.stdout.write(`Removed "${filename}" (id: ${target.id}) from work item ${id}\n`);
        } catch (err: unknown) {
          handleCommandError(err, id, context, 'write');
        }
      },
    );

  return command;
}
