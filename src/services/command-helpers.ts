import type { AzdoContext } from '../types/work-item.js';

/**
 * Parse and validate a work item ID string. Exits with error if invalid.
 */
export function parseWorkItemId(idStr: string): number {
  const id = Number.parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) {
    process.stderr.write(
      `Error: Work item ID must be a positive integer. Got: "${idStr}"\n`,
    );
    process.exit(1);
  }
  return id;
}

/**
 * Validate that --org and --project are both provided or both omitted.
 */
export function validateOrgProjectPair(options: { org?: string; project?: string }): void {
  const hasOrg = options.org !== undefined;
  const hasProject = options.project !== undefined;
  if (hasOrg !== hasProject) {
    process.stderr.write(
      'Error: --org and --project must both be provided, or both omitted.\n',
    );
    process.exit(1);
  }
}

/**
 * Handle known Azure DevOps command errors with user-friendly messages.
 */
export function handleCommandError(
  err: unknown,
  id: number,
  context?: AzdoContext,
  scope: 'read' | 'write' = 'write',
  exit = true,
): void {
  const error = err instanceof Error ? err : new Error(String(err));
  const msg = error.message;

  const scopeLabel = scope === 'read' ? 'Work Items (read)' : 'Work Items (Read & Write)';

  if (msg === 'AUTH_FAILED') {
    process.stderr.write(
      `Error: Authentication failed. Check that your PAT is valid and has the "${scopeLabel}" scope.\n`,
    );
  } else if (msg === 'PERMISSION_DENIED') {
    process.stderr.write(
      `Error: Access denied. Your PAT may lack ${scope} permissions for project "${context?.project}".\n`,
    );
  } else if (msg === 'NOT_FOUND') {
    process.stderr.write(
      `Error: Work item ${id} not found in ${context?.org}/${context?.project}.\n`,
    );
  } else if (msg === 'NETWORK_ERROR') {
    process.stderr.write(
      'Error: Could not connect to Azure DevOps. Check your network connection.\n',
    );
  } else if (msg.startsWith('BAD_REQUEST:')) {
    const serverMsg = msg.replace('BAD_REQUEST: ', '');
    process.stderr.write(`Error: Request rejected: ${serverMsg}\n`);
  } else if (msg.startsWith('UPDATE_REJECTED:')) {
    const serverMsg = msg.replace('UPDATE_REJECTED: ', '');
    process.stderr.write(`Error: Update rejected: ${serverMsg}\n`);
  } else {
    process.stderr.write(`Error: ${msg}\n`);
  }

  if (exit) {
    process.exit(1);
  } else {
    process.exitCode = 1;
  }
}
