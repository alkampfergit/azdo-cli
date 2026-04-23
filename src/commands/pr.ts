import { Command } from 'commander';
import type {
  ActiveCommentThread,
  BranchPullRequestMatch,
  PullRequestCommentsResult,
  PullRequestCheck,
  PullRequestStatusPullRequest,
  PullRequestStatusResult,
} from '../types/pull-request.js';
import type { AzdoContext } from '../types/work-item.js';
import {
  listPullRequests,
  openPullRequest,
  getPullRequestThreads,
  getPullRequestChecks,
  getPullRequestById,
  isThreadResolved,
} from '../services/pr-client.js';
import { requirePat } from '../services/auth.js';
import { resolveContext } from '../services/context.js';
import { validateOrgProjectPair } from '../services/command-helpers.js';
import { detectRepoName, getCurrentBranch } from '../services/git-remote.js';

interface PrCommandOptions {
  org?: string;
  project?: string;
  json?: boolean;
  hideResolved?: boolean;
  prNumber?: string;
}

// Parses `--pr-number <N>` into a positive integer. Returns null on any
// invalid input — leading sign, whitespace, float, zero, negative,
// non-numeric — letting the caller print a validation error.
function parsePositivePrNumber(raw: string): number | null {
  if (!/^\d+$/.test(raw)) {
    return null;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

interface ResolvedPrCommandContext {
  context: AzdoContext;
  repo: string;
  branch: string | null;
  pat: string;
}

function formatBranchName(refName: string): string {
  return refName.startsWith('refs/heads/') ? refName.slice('refs/heads/'.length) : refName;
}

// Writes a user-facing error to stderr and flags the process for a non-zero
// exit code. Returns void — does NOT call process.exit(), because a
// synchronous exit from inside an async .action() handler can race libuv's
// async-handle close on Windows pwsh (observed in issue #34). Callers MUST
// `return` after writeError() to avoid falling through to the happy path.
function writeError(message: string): void {
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
}

function handlePrCommandError(err: unknown, context?: AzdoContext, mode: 'read' | 'write' = 'read'): void {
  const error = err instanceof Error ? err : new Error(String(err));

  if (error.message === 'AUTH_FAILED') {
    const scopeLabel = mode === 'write' ? 'Code (Read & Write)' : 'Code (Read)';
    writeError(`Authentication failed. Check that your PAT is valid and has the "${scopeLabel}" scope.`);
    return;
  }

  if (error.message === 'PERMISSION_DENIED') {
    writeError(`Access denied. Your PAT may lack ${mode} permissions for project "${context?.project}".`);
    return;
  }

  if (error.message === 'NETWORK_ERROR') {
    writeError('Could not connect to Azure DevOps. Check your network connection.');
    return;
  }

  if (error.message.startsWith('NOT_FOUND')) {
    writeError(`Azure DevOps repository not found in ${context?.org}/${context?.project}.`);
    return;
  }

  if (error.message.startsWith('HTTP_')) {
    writeError(`Azure DevOps request failed with ${error.message}.`);
    return;
  }

  writeError(error.message);
}

function formatPullRequestChecks(checks: PullRequestCheck[]): string[] {
  if (checks.length === 0) {
    return ['Checks: none reported by Azure DevOps'];
  }

  const lines = ['Checks:'];
  for (const check of checks) {
    lines.push(`- [${check.state}] ${check.name}`);
    if ((check.state === 'failed' || check.state === 'error') && check.description) {
      lines.push(`  Detail: ${check.description}`);
    }
  }

  return lines;
}

function formatPullRequestBlock(pullRequest: PullRequestStatusPullRequest): string {
  return [
    `#${pullRequest.id} [${pullRequest.status}] ${pullRequest.title}`,
    `${formatBranchName(pullRequest.sourceRefName)} -> ${formatBranchName(pullRequest.targetRefName)}`,
    pullRequest.url ?? '—',
    ...formatPullRequestChecks(pullRequest.checks),
  ].join('\n');
}

// Short user-facing label for a thread's backend status. Any state that
// isThreadResolved() considers settled collapses to "resolved" to match the
// spec's short status convention (FR-003); active and pending keep their
// backend names since operators recognise them from the Azure DevOps UI.
function threadStatusLabel(status: string): string {
  return isThreadResolved(status) ? 'resolved' : status;
}

function formatThreads(prId: number, title: string, threads: ActiveCommentThread[]): string {
  const lines = [`Active comments for pull request #${prId}: ${title}`];

  for (const thread of threads) {
    lines.push('', `Thread #${thread.id} [${threadStatusLabel(thread.status)}] ${thread.threadContext ?? '(general)'}`);
    for (const comment of thread.comments) {
      lines.push(`  ${comment.author ?? 'Unknown'}: ${comment.content}`);
    }
  }

  return lines.join('\n');
}

async function resolvePrCommandContext(
  options: PrCommandOptions,
  resolveOpts: { requireBranch?: boolean } = {},
): Promise<ResolvedPrCommandContext> {
  const requireBranch = resolveOpts.requireBranch ?? true;
  const context = resolveContext(options);
  const repo = detectRepoName();
  let branch: string | null;
  if (requireBranch) {
    branch = getCurrentBranch();
  } else {
    try {
      branch = getCurrentBranch();
    } catch {
      // Working on detached HEAD or a branch that can't be resolved is
      // fine when the caller is targeting a PR by number.
      branch = null;
    }
  }
  const credential = await requirePat(context.org);

  return {
    context,
    repo,
    branch,
    pat: credential.pat,
  };
}

export function createPrStatusCommand(): Command {
  const command = new Command('status');

  command
    .description('Check pull requests for the current branch')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .option('--json', 'output JSON')
    .action(async (options: PrCommandOptions) => {
      validateOrgProjectPair(options);

      let context: AzdoContext | undefined;

      try {
        const resolved = await resolvePrCommandContext(options);
        context = resolved.context;

        // pr status uses the default requireBranch=true resolver, so branch
        // is guaranteed non-null at runtime.
        const branch = resolved.branch!;
        const pullRequests = await listPullRequests(resolved.context, resolved.repo, resolved.pat, branch);
        const pullRequestsWithChecks: PullRequestStatusPullRequest[] = await Promise.all(
          pullRequests.map(async (pullRequest) => ({
            ...pullRequest,
            checks: await getPullRequestChecks(resolved.context, resolved.repo, resolved.pat, pullRequest.id),
          })),
        );
        const result: PullRequestStatusResult = { branch, repository: resolved.repo, pullRequests: pullRequestsWithChecks };

        if (options.json) {
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
          return;
        }

        if (pullRequestsWithChecks.length === 0) {
          process.stdout.write(`No pull requests found for branch ${branch}.\n`);
          return;
        }

        process.stdout.write(`${pullRequestsWithChecks.map(formatPullRequestBlock).join('\n\n')}\n`);
      } catch (err) {
        handlePrCommandError(err, context, 'read');
      }
    });

  return command;
}

export function createPrOpenCommand(): Command {
  const command = new Command('open');

  command
    .description('Open a pull request from the current branch to develop')
    .option('--title <title>', 'pull request title')
    .option('--description <description>', 'pull request description')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .option('--json', 'output JSON')
    .action(async (options: {
      title?: string;
      description?: string;
      org?: string;
      project?: string;
      json?: boolean;
    }) => {
      validateOrgProjectPair(options);

      const title = options.title?.trim();
      if (!title) {
        writeError('--title is required for pull request creation.');
        return;
      }

      const description = options.description?.trim();
      if (!description) {
        writeError('--description is required for pull request creation.');
        return;
      }

      let context: AzdoContext | undefined;

      try {
        const resolved = await resolvePrCommandContext(options);
        context = resolved.context;

        if (resolved.branch === 'develop') {
          writeError('Pull request creation requires a source branch other than develop.');
          return;
        }

        // pr open uses the default requireBranch=true resolver.
        const openBranch = resolved.branch!;
        const result = await openPullRequest(
          resolved.context,
          resolved.repo,
          resolved.pat,
          openBranch,
          title,
          description,
        );

        if (options.json) {
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
          return;
        }

        if (result.created) {
          process.stdout.write(`Created pull request #${result.pullRequest.id}: ${result.pullRequest.title}\n${result.pullRequest.url ?? '—'}\n`);
          return;
        }

        process.stdout.write(
          `Active pull request already exists for ${resolved.branch} -> develop: #${result.pullRequest.id}\n${result.pullRequest.url ?? '—'}\n`,
        );
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('AMBIGUOUS_PRS:')) {
          const ids = err.message.replace('AMBIGUOUS_PRS:', '').split(',').map((id) => `#${id}`).join(', ');
          writeError(`Multiple active pull requests already exist for this branch targeting develop: ${ids}. Use pr status to review them.`);
          return;
        }

        handlePrCommandError(err, context, 'write');
      }
    });

  return command;
}

export function createPrCommentsCommand(): Command {
  const command = new Command('comments');

  command
    .description('List pull request comment threads for the current branch')
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .option('--pr-number <N>', 'target the pull request with this numeric id, instead of the current branch\'s PR')
    .option('--hide-resolved', 'hide threads whose status is resolved / won\'t fix / closed / by design')
    .option('--json', 'output JSON')
    .action(async (options: PrCommandOptions) => {
      validateOrgProjectPair(options);

      let context: AzdoContext | undefined;
      let explicitPrId: number | null = null;
      if (options.prNumber !== undefined) {
        explicitPrId = parsePositivePrNumber(options.prNumber);
        if (explicitPrId === null) {
          writeError(`Invalid --pr-number "${options.prNumber}"; expected a positive integer.`);
          return;
        }
      }

      try {
        const resolved = await resolvePrCommandContext(options, { requireBranch: explicitPrId === null });
        context = resolved.context;

        let pullRequest: BranchPullRequestMatch;
        let branchLabel: string;

        if (explicitPrId !== null) {
          try {
            pullRequest = await getPullRequestById(resolved.context, resolved.repo, resolved.pat, explicitPrId);
          } catch (err) {
            if (err instanceof Error && err.message.startsWith('NOT_FOUND')) {
              writeError(`Pull request #${explicitPrId} not found in ${resolved.context.org}/${resolved.context.project}/${resolved.repo}.`);
              return;
            }
            throw err;
          }
          branchLabel = resolved.branch ?? pullRequest.sourceRefName;
        } else {
          const pullRequests = await listPullRequests(resolved.context, resolved.repo, resolved.pat, resolved.branch!, {
            status: 'active',
          });

          if (pullRequests.length === 0) {
            writeError(`No active pull request found for branch ${resolved.branch}.`);
            return;
          }

          if (pullRequests.length > 1) {
            const ids = pullRequests.map((pr) => `#${pr.id}`).join(', ');
            writeError(`Multiple active pull requests found for branch ${resolved.branch}: ${ids}. Use pr status to review them.`);
            return;
          }

          pullRequest = pullRequests[0];
          branchLabel = resolved.branch!;
        }

        const allThreads = await getPullRequestThreads(resolved.context, resolved.repo, resolved.pat, pullRequest.id);
        const threads = options.hideResolved
          ? allThreads.filter((thread) => !isThreadResolved(thread.status))
          : allThreads;
        const result: PullRequestCommentsResult = { branch: branchLabel, pullRequest, threads };

        if (options.json) {
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
          return;
        }

        if (threads.length === 0) {
          process.stdout.write(`Pull request #${pullRequest.id} has no active comments.\n`);
          return;
        }

        process.stdout.write(`${formatThreads(pullRequest.id, pullRequest.title, threads)}\n`);
      } catch (err) {
        handlePrCommandError(err, context, 'read');
      }
    });

  return command;
}

export function createPrCommand(): Command {
  const command = new Command('pr');
  command.description('Manage Azure DevOps pull requests');
  command.addCommand(createPrStatusCommand());
  command.addCommand(createPrOpenCommand());
  command.addCommand(createPrCommentsCommand());
  return command;
}
