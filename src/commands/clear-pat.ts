import { Command } from 'commander';
import { deletePat } from '../services/credential-store.js';

export function createClearPatCommand(): Command {
  const command = new Command('clear-pat');

  command
    .description('Remove the stored Azure DevOps PAT from the credential store')
    .action(async () => {
      const deleted = await deletePat();
      if (deleted) {
        process.stdout.write('PAT removed from credential store.\n');
      } else {
        process.stdout.write('No stored PAT found.\n');
      }
    });

  return command;
}
