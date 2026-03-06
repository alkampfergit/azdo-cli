import { Command } from 'commander';
import type { AzdoContext } from '../types/work-item.js';
import { updateWorkItem } from '../services/azdo-client.js';
import { resolvePat } from '../services/auth.js';
import { detectAzdoContext } from '../services/git-remote.js';
import { loadConfig } from '../services/config-store.js';

function resolveContext(options: { org?: string; project?: string }): AzdoContext {
  if (options.org && options.project) {
    return { org: options.org, project: options.project };
  }

  const config = loadConfig();
  if (config.org && config.project) {
    return { org: config.org, project: config.project };
  }

  let gitContext: AzdoContext | null = null;
  try {
    gitContext = detectAzdoContext();
  } catch {
    // not in a git repo or not an azdo remote
  }

  const org = config.org || gitContext?.org;
  const project = config.project || gitContext?.project;

  if (org && project) {
    return { org, project };
  }

  throw new Error(
    'Could not determine org/project. Use --org and --project flags, work from an Azure DevOps git repo, or run "azdo config set org/project".',
  );
}

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
        const id = parseInt(idStr, 10);
        if (!Number.isInteger(id) || id <= 0) {
          process.stderr.write(
            `Error: Work item ID must be a positive integer. Got: "${idStr}"\n`,
          );
          process.exit(1);
        }

        const hasOrg = options.org !== undefined;
        const hasProject = options.project !== undefined;
        if (hasOrg !== hasProject) {
          process.stderr.write(
            'Error: --org and --project must both be provided, or both omitted.\n',
          );
          process.exit(1);
        }

        let context: AzdoContext;

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
          const error = err instanceof Error ? err : new Error(String(err));
          const msg = error.message;

          if (msg === 'AUTH_FAILED') {
            process.stderr.write(
              'Error: Authentication failed. Check that your PAT is valid and has the "Work Items (Read & Write)" scope.\n',
            );
          } else if (msg === 'PERMISSION_DENIED') {
            process.stderr.write(
              `Error: Access denied. Your PAT may lack write permissions for project "${context!.project}".\n`,
            );
          } else if (msg === 'NOT_FOUND') {
            process.stderr.write(
              `Error: Work item ${id} not found in ${context!.org}/${context!.project}.\n`,
            );
          } else if (msg.startsWith('UPDATE_REJECTED:')) {
            const serverMsg = msg.replace('UPDATE_REJECTED: ', '');
            process.stderr.write(`Error: Update rejected: ${serverMsg}\n`);
          } else if (msg === 'NETWORK_ERROR') {
            process.stderr.write(
              'Error: Could not connect to Azure DevOps. Check your network connection.\n',
            );
          } else {
            process.stderr.write(`Error: ${msg}\n`);
          }

          process.exit(1);
        }
      },
    );

  return command;
}
