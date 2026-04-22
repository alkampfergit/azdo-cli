import { Command } from 'commander';
import { deletePat } from '../services/credential-store.js';
import { resolveOrg, formatResolutionError } from '../services/org-resolver.js';

export function createClearPatCommand(): Command {
  const command = new Command('clear-pat');

  command
    .description('Remove a stored Azure DevOps PAT (deprecated: use `azdo auth logout`)')
    .option('--org <name>', 'Azure DevOps organization (overrides auto-detect / config)')
    .action(async (options: { org?: string }) => {
      process.stderr.write('`azdo clear-pat` is deprecated; use `azdo auth logout [--org <name>]` instead.\n');

      const resolved = resolveOrg({ org: options.org });
      if (!resolved) {
        process.stderr.write(`${formatResolutionError()}\n`);
        process.exitCode = 3;
        return;
      }

      const deleted = await deletePat(resolved.org);
      if (deleted) {
        process.stdout.write(`PAT removed for org ${resolved.org}.\n`);
      } else {
        process.stdout.write(`No stored PAT found for org ${resolved.org}.\n`);
      }
    });

  return command;
}
