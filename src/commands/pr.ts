import { existsSync, readFileSync } from 'node:fs';
import { Command } from 'commander';
import type {
  ActiveCommentThread,
  ActivePullRequestComment,
  BranchPullRequestMatch,
  CodeCommentCounts,
  CreatableThreadStatus,
  PullRequestCommentsResult,
  PullRequestCheck,
  PullRequestStatusPullRequest,
  PullRequestStatusResult,
} from '../types/pull-request.js';
import type { AuthCredential, AzdoContext } from '../types/work-item.js';
import {
  listPullRequests,
  listRepositoryPullRequests,
  openPullRequest,
  createPullRequestThread,
  getPullRequestThread,
  getPullRequestThreads,
  getPullRequestChecks,
  getPullRequestPolicyEvaluations,
  getPullRequestBuilds,
  resolveProjectId,
  getPullRequestById,
  isThreadResolved,
  patchThreadStatus,
  postThreadComment,
  updateThreadComment,
  linkWorkItemToPullRequest,
  unlinkWorkItemFromPullRequest,
  resolveReviewerIdentity,
  addOrUpdatePullRequestReviewer,
  getPullRequestReviewers,
  removePullRequestReviewer,
} from '../services/pr-client.js';
import { describeResolvedCredential, requireAuthCredential } from '../services/auth.js';
import { resolveContext } from '../services/context.js';
import { validateOrgProjectPair } from '../services/command-helpers.js';
import { detectRepoName, getCurrentBranch } from '../services/git-remote.js';

interface PrCommandOptions {
  org?: string;
  project?: string;
  repo?: string;
  json?: boolean;
  hideResolved?: boolean;
  excludeResolved?: boolean;
  codeRelatedOnly?: boolean;
  excludeSystem?: boolean;
  maxChars?: string;
  thread?: string;
  contains?: string;
  prNumber?: string;
  required?: boolean;
  commentId?: string;
  file?: string;
  status?: string;
  dryRun?: boolean;
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

// Shared help text for the `--pr-number` option on the single-PR commands
// (comments / comment-resolve / comment-reopen). Defined once so the wording
// cannot drift between subcommands (FR-005 / contract C-1). `pr status` is a
// multi-PR list command and intentionally does NOT carry this option (owner
// decision A on PR #43).
const PR_NUMBER_HELP =
  "target the pull request with this numeric id, instead of the current branch's PR. " +
  'When omitted, the CLI auto-detects the pull request whose source branch equals ' +
  'refs/heads/<current branch> in the Azure DevOps repository identified by the origin ' +
  'remote; if zero or more than one open PR matches, the command fails with a message ' +
  'naming the searched branch.';

// Shared help text for `--repo`, available on every `pr` subcommand. The
// origin remote stays the default so existing invocations are unaffected;
// passing the flag makes the command usable from outside the repository
// working copy (or against a sibling repo in the same project).
const PR_REPO_HELP =
  'Azure DevOps repository name; defaults to the repository of the git "origin" remote';

// Renders help without commander's column wrapping, so the C-1 substring stays
// contiguous in `--help` output regardless of terminal width.
function configureUnwrappedHelp(command: Command): Command {
  return command.configureHelp({ helpWidth: 1000 });
}

// Registers the option set every `pr` subcommand shares. Kept in one place so
// a new flag cannot land on some subcommands and silently miss the others.
function withCommonPrOptions(command: Command): Command {
  return command
    .option('--org <org>', 'Azure DevOps organization')
    .option('--project <project>', 'Azure DevOps project')
    .option('--repo <name>', PR_REPO_HELP);
}

// Commander stores an option's value on the command that DECLARED it. Both
// `pr comments` and its `add` / `edit` / `reply` subcommands declare
// --org/--project/--repo/--pr-number/--json, so in the nested form
// (`azdo pr comments add …`) the value lands on the parent and the
// subcommand's own opts() never sees it — silently dropping --pr-number (the
// command would then target the current branch's PR instead of the requested
// one) and --json. Reading the merged view fixes the nested form; the
// top-level aliases have no such ancestor and behave identically.
function mergedPrOptions(command: Command): PrCommandOptions {
  return command.optsWithGlobals() as PrCommandOptions;
}

// C-2 (FR-006): the exact zero-match auto-detection error. Emitted verbatim to
// stderr — NO "Error: " prefix — with exit code 1 and empty stdout.
function autoDetectZeroMatch(branch: string): string {
  return `No open pull request matches branch ${branch}. Pass --pr-number to target a specific PR, or push the branch and open a pull request.`;
}

// C-3 (FR-006): the exact multi-match auto-detection error. PR numbers are
// listed in the order Azure DevOps returned them (no re-sort), each `#`-prefixed
// and `, `-joined. Never prompts, even under a TTY.
function autoDetectMultiMatch(branch: string, ids: number[]): string {
  const idList = ids.map((id) => `#${id}`).join(', ');
  return `Multiple open pull requests match branch ${branch}: ${idList}. Re-run with --pr-number to choose.`;
}

// Writes a contract error line verbatim to stderr (no "Error: " prefix, unlike
// writeError) and flags a non-zero exit. Used for the C-2/C-3 strings whose
// exact text is pinned by contract. Callers MUST `return` afterwards.
function writeContractError(line: string): void {
  process.stderr.write(`${line}\n`);
  process.exitCode = 1;
}

// Wording shared by every "no body supplied" / "empty body" rejection, so the
// two authoring commands (add / edit) and reply fail identically.
const EMPTY_BODY_ERROR = 'Comment text must not be empty. Pass the text inline or use --file <path>.';

// Resolves a comment body from the inline positional argument or --file, which
// are mutually exclusive. Returns null when the input is unusable — the error
// has already been written to stderr and the exit code flagged, so callers
// simply `return`. The body is trimmed: Azure DevOps stores it verbatim, and a
// trailing newline from a markdown file is never meaningful.
function resolveCommentBody(
  inline: string | undefined,
  file: string | undefined,
  emptyMessage: string = EMPTY_BODY_ERROR,
): string | null {
  if (inline !== undefined && file !== undefined) {
    writeError('Cannot specify both inline text and --file.');
    return null;
  }

  let body: string;
  if (file !== undefined) {
    if (!existsSync(file)) {
      writeError(`File not found: ${file}`);
      return null;
    }
    try {
      body = readFileSync(file, 'utf-8');
    } catch {
      writeError(`Cannot read file: ${file}`);
      return null;
    }
  } else if (inline !== undefined) {
    body = inline;
  } else {
    writeError(emptyMessage);
    return null;
  }

  const trimmed = body.trim();
  if (trimmed === '') {
    writeError(emptyMessage);
    return null;
  }

  return trimmed;
}

// Parses `--max-chars <n>`: any non-negative integer, where 0 means "no limit".
function parseNonNegativeInt(raw: string): number | null {
  if (!/^\d+$/.test(raw)) {
    return null;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

// Shortens a comment body to `limit` characters, marking the cut with an
// ellipsis so a truncated comment can never be mistaken for the whole text in
// human-readable output. `truncated` / `originalLength` carry the same fact in
// --json, where sniffing for the ellipsis would mean parsing content to learn
// something about the data.
interface TruncatedContent {
  content: string;
  truncated: boolean;
  originalLength: number;
}

function truncateContent(text: string, limit: number): TruncatedContent {
  if (limit <= 0 || text.length <= limit) {
    return { content: text, truncated: false, originalLength: text.length };
  }
  return { content: `${text.slice(0, limit)} […]`, truncated: true, originalLength: text.length };
}

interface ResolvedPrCommandContext {
  context: AzdoContext;
  repo: string;
  branch: string | null;
  pat: AuthCredential;
}

function formatBranchName(refName: string): string {
  return refName.startsWith('refs/heads/') ? refName.slice('refs/heads/'.length) : refName;
}

// Writes a user-facing error to stderr and flags the process for a non-zero
// exit code. Returns void — does NOT call process.exit(), because a
// synchronous exit from inside an async .action() handler can race libuv's
// async-handle close on Windows pwsh (observed in issue #34). Callers MUST
// `return` after writeError() to avoid falling through to the happy path.
// Exit-code contract for the `pr` group (documented in docs/commands.md):
//   0  success, dry runs included
//   1  validation failure, or any other error (network, unexpected HTTP status)
//   3  an addressed resource does not exist: pull request, thread, comment
//   4  not permitted: authentication failure or permission denied
// A caller can therefore tell "not permitted" from "not found" without
// scraping stderr. Branch auto-detection zero/multi-match stays at 1: contract
// C-2/C-3 (019) pins that code, and it is a resolution failure rather than a
// named resource that could not be found.
const EXIT_NOT_FOUND = 3;
const EXIT_NOT_PERMITTED = 4;

function writeError(message: string, exitCode = 1): void {
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = exitCode;
}

function handlePrCommandError(err: unknown, context?: AzdoContext, mode: 'read' | 'write' = 'read'): void {
  const error = err instanceof Error ? err : new Error(String(err));

  if (error.message === 'AUTH_FAILED') {
    // The first line is unchanged from previous releases (callers match it);
    // the token-source line is additive and is what makes the failure
    // actionable — a PAT scoped for Work Items but not Code makes every `pr`
    // command fail while `azdo get-item` keeps working, which reads as
    // "the pr commands are broken" unless the message says which token it used.
    const scopeLabel = mode === 'write' ? 'Code (Read & Write)' : 'Code (Read)';
    writeError(`Authentication failed. Check that your PAT is valid and has the "${scopeLabel}" scope.`, EXIT_NOT_PERMITTED);
    const credentialHint = describeResolvedCredential();
    if (credentialHint !== null) {
      process.stderr.write(`  ${credentialHint}\n`);
    }
    return;
  }

  if (error.message === 'IDENTITY_SCOPE_MISSING') {
    writeError(
      'Could not resolve reviewer identity: your PAT is missing the "Identity (Read)" scope required by the Azure DevOps identities API (separate from Code scope).',
      EXIT_NOT_PERMITTED,
    );
    return;
  }

  if (error.message === 'PERMISSION_DENIED') {
    writeError(`Access denied. Your PAT may lack ${mode} permissions for project "${context?.project}".`, EXIT_NOT_PERMITTED);
    return;
  }

  if (error.message === 'NETWORK_ERROR') {
    writeError('Could not connect to Azure DevOps. Check your network connection.');
    return;
  }

  if (error.message.startsWith('NOT_FOUND')) {
    writeError(`Azure DevOps repository not found in ${context?.org}/${context?.project}.`, EXIT_NOT_FOUND);
    return;
  }

  if (error.message.startsWith('HTTP_')) {
    writeError(`Azure DevOps request failed with ${error.message}.`);
    return;
  }

  writeError(error.message);
}

function formatPullRequestChecks(checks: PullRequestCheck[], checksError?: string | null): string[] {
  if (checksError) {
    // A retrieval failure must never look like "no checks" (FR-002).
    return [`Checks: unable to retrieve (${checksError})`];
  }

  if (checks.length === 0) {
    return ['Checks: none reported by Azure DevOps'];
  }

  const lines = ['Checks:'];
  for (const check of checks) {
    const optionalTag = check.isBlocking === false ? ' [optional]' : '';
    lines.push(`- [${check.state}] ${check.name}${optionalTag}`);
    if ((check.state === 'failed' || check.state === 'error') && check.description) {
      lines.push(`  Detail: ${check.description}`);
    }
  }

  return lines;
}

// Counts code-anchored (file/line) threads bucketed by resolved state. General
// (non-file-anchored) threads are excluded from both buckets (FR-008).
function countCodeComments(threads: ActiveCommentThread[]): CodeCommentCounts {
  let open = 0;
  let closed = 0;
  for (const thread of threads) {
    if (thread.threadContext === null) {
      continue;
    }
    if (isThreadResolved(thread.status)) {
      closed += 1;
    } else {
      open += 1;
    }
  }
  return { open, closed };
}

function formatCodeCommentCounts(counts: CodeCommentCounts): string {
  return `Code comments: ${counts.open} open, ${counts.closed} closed`;
}

function formatPullRequestBlock(pullRequest: PullRequestStatusPullRequest): string {
  return [
    `#${pullRequest.id} [${pullRequest.status}] ${pullRequest.title}`,
    `${formatBranchName(pullRequest.sourceRefName)} -> ${formatBranchName(pullRequest.targetRefName)}`,
    pullRequest.url ?? '—',
    ...formatPullRequestChecks(pullRequest.checks, pullRequest.checksError),
    formatCodeCommentCounts(pullRequest.codeCommentCounts),
  ].join('\n');
}

// Builds one PR status entry: merges status-API checks with branch policy
// evaluations and computes code-comment counts. Each remote fetch is isolated
// so a single failure degrades gracefully instead of aborting the command:
// - checks: error reported only when BOTH sources fail (FR-002);
// - threads: a failure yields zero counts rather than hiding the PR.
async function buildPullRequestStatusEntry(
  context: AzdoContext,
  repo: string,
  cred: AuthCredential,
  pullRequest: BranchPullRequestMatch,
  projectId: string | null,
): Promise<PullRequestStatusPullRequest> {
  let statusChecks: PullRequestCheck[] = [];
  let statusOk = true;
  try {
    statusChecks = await getPullRequestChecks(context, repo, cred, pullRequest.id);
  } catch {
    statusOk = false;
  }

  let policyChecks: PullRequestCheck[] = [];
  // A null projectId means the GUID could not be resolved, so the policy
  // source could not even be attempted — that counts as a policy error so an
  // empty result is not misreported as "none".
  let policyOk = true;
  if (projectId === null) {
    policyOk = false;
  } else {
    try {
      policyChecks = await getPullRequestPolicyEvaluations(context, cred, projectId, pullRequest.id);
    } catch {
      policyOk = false;
    }
  }

  let buildChecks: PullRequestCheck[] = [];
  let buildsOk = true;
  try {
    buildChecks = await getPullRequestBuilds(context, cred, pullRequest.id);
  } catch {
    buildsOk = false;
  }

  let codeCommentCounts: CodeCommentCounts;
  try {
    const threads = await getPullRequestThreads(context, repo, cred, pullRequest.id);
    codeCommentCounts = countCodeComments(threads);
  } catch {
    codeCommentCounts = { open: 0, closed: 0 };
  }

  const checks = [...statusChecks, ...policyChecks, ...buildChecks];
  // Only report a retrieval failure when we have nothing to show AND a source
  // actually failed — otherwise real (possibly partial) results are shown, and
  // a genuine empty result still reads as "none reported" (FR-002).
  const checksError =
    checks.length === 0 && (!statusOk || !policyOk || !buildsOk) ? 'Azure DevOps request failed' : null;

  return {
    ...pullRequest,
    checks,
    codeCommentCounts,
    checksError,
  };
}

// Short user-facing label for a thread's backend status. Any state that
// isThreadResolved() considers settled collapses to "resolved" to match the
// spec's short status convention (FR-003); active and pending keep their
// backend names since operators recognise them from the Azure DevOps UI.
function threadStatusLabel(status: string): string {
  return isThreadResolved(status) ? 'resolved' : status;
}

// Applies the output-shaping filters to a single thread, in this order:
//   1. drop Azure DevOps system comments (--exclude-system);
//   2. keep the thread only if a surviving comment contains --contains;
//   3. shorten the bodies that are left (--max-chars).
// The substring test runs on the FULL body, before truncation, so a marker
// beyond the --max-chars cut is still found — the two flags are routinely
// combined to locate one thread cheaply.
// Returns null when filtering left nothing to show, so a purely
// system-generated (or non-matching) thread disappears instead of printing an
// empty header.
function shapeThreadForOutput(
  thread: ActiveCommentThread,
  opts: { excludeSystem: boolean; maxChars: number; contains?: string },
): ActiveCommentThread | null {
  const kept = thread.comments.filter(
    (comment) => !opts.excludeSystem || comment.commentType !== 'system',
  );

  if (opts.excludeSystem && kept.length === 0) {
    return null;
  }

  if (opts.contains !== undefined && !kept.some((comment) => comment.content.includes(opts.contains!))) {
    return null;
  }

  const comments: ActivePullRequestComment[] = kept.map((comment) => ({
    ...comment,
    ...truncateContent(comment.content, opts.maxChars),
  }));

  return { ...thread, comments };
}

function formatThreads(prId: number, title: string, threads: ActiveCommentThread[]): string {
  const lines = [`Comment threads for pull request #${prId}: ${title}`];

  for (const thread of threads) {
    const lineSuffix = thread.line === null ? '' : `:${thread.line}`;
    const location = thread.threadContext ? `${thread.threadContext}${lineSuffix}` : '(general)';
    lines.push('', `Thread #${thread.id} [${threadStatusLabel(thread.status)}] ${location}`);
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
  // An explicit --repo skips the git remote lookup entirely, so the command
  // works outside a checkout of the target repository.
  const repo = options.repo?.trim() || detectRepoName();
  // When the caller is targeting a PR by explicit number we skip the git
  // branch lookup entirely — it's unnecessary and would fail loudly on
  // detached HEAD or a branch that can't be resolved.
  const branch: string | null = requireBranch ? getCurrentBranch() : null;
  const credential = await requireAuthCredential(context.org);

  return {
    context,
    repo,
    branch,
    pat: credential,
  };
}

export function createPrStatusCommand(): Command {
  const command = new Command('status');

  withCommonPrOptions(command)
    .description('Check pull requests for the current branch')
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

        // The policy-evaluation artifactId needs the project GUID. Resolve it
        // once (best-effort): if it fails, we still show status-API checks and
        // simply skip the policy source for every PR.
        let projectId: string | null = null;
        try {
          projectId = await resolveProjectId(resolved.context, resolved.pat);
        } catch {
          projectId = null;
        }

        const pullRequestsWithChecks: PullRequestStatusPullRequest[] = await Promise.all(
          pullRequests.map(async (pullRequest) =>
            buildPullRequestStatusEntry(resolved.context, resolved.repo, resolved.pat, pullRequest, projectId),
          ),
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

  withCommonPrOptions(command)
    .description('Open a pull request from the current branch to develop')
    .option('--title <title>', 'pull request title')
    .option(
      '--description <description>',
      'pull request description; when omitted, a repository-defined pull request template is used if one exists (prepended by this text when both are present)',
    )
    .option('--json', 'output JSON')
    .action(async (options: {
      title?: string;
      description?: string;
      org?: string;
      project?: string;
      repo?: string;
      json?: boolean;
    }) => {
      validateOrgProjectPair(options);

      const title = options.title?.trim();
      if (!title) {
        writeError('--title is required for pull request creation.');
        return;
      }

      const trimmedDescription = options.description?.trim();
      const description = trimmedDescription && trimmedDescription.length > 0 ? trimmedDescription : undefined;

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

        if (err instanceof Error && err.message === 'DESCRIPTION_REQUIRED') {
          writeError('--description is required for pull request creation.');
          return;
        }

        handlePrCommandError(err, context, 'write');
      }
    });

  return command;
}

export function createPrCommentsCommand(): Command {
  const command = new Command('comments');

  withCommonPrOptions(configureUnwrappedHelp(command))
    .description('List pull request comment threads for the current branch')
    .option('--pr-number <N>', PR_NUMBER_HELP)
    .option('--hide-resolved', 'hide threads whose status is resolved / won\'t fix / closed / by design')
    .option('--exclude-resolved', 'alias of --hide-resolved: exclude resolved / won\'t fix / closed / by design threads')
    .option('--code-related-only', 'show only threads anchored to a file/line; omit general discussion threads')
    .option('--exclude-system', 'omit Azure DevOps system comments (branch updates, reviewer votes, build events)')
    .option('--max-chars <N>', 'truncate each comment body to N characters (0 = no limit, the default)')
    .option('--thread <id>', 'show only the thread with this numeric id; fails when the pull request has no such thread')
    .option('--contains <text>', 'show only threads holding a comment that contains this literal, case-sensitive substring (matched before --max-chars truncates)')
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

      let maxChars = 0;
      if (options.maxChars !== undefined) {
        const parsed = parseNonNegativeInt(options.maxChars);
        if (parsed === null) {
          writeError(`Invalid --max-chars "${options.maxChars}"; expected a non-negative integer.`);
          return;
        }
        maxChars = parsed;
      }

      let threadFilter: number | null = null;
      if (options.thread !== undefined) {
        threadFilter = parsePositivePrNumber(options.thread);
        if (threadFilter === null) {
          writeError(`Invalid --thread "${options.thread}"; expected a positive integer.`);
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
              writeError(`Pull request #${explicitPrId} not found in ${resolved.context.org}/${resolved.context.project}/${resolved.repo}.`, EXIT_NOT_FOUND);
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
            writeContractError(autoDetectZeroMatch(resolved.branch!));
            return;
          }

          if (pullRequests.length > 1) {
            writeContractError(autoDetectMultiMatch(resolved.branch!, pullRequests.map((pr) => pr.id)));
            return;
          }

          pullRequest = pullRequests[0];
          branchLabel = resolved.branch!;
        }

        // --exclude-resolved is an alias of --hide-resolved (owner decision on
        // #50): either flag drops resolved threads, no behaviour change when
        // neither is set.
        const hideResolved = options.hideResolved === true || options.excludeResolved === true;
        const codeRelatedOnly = options.codeRelatedOnly === true;
        const excludeSystem = options.excludeSystem === true;

        const fetchedThreads = await getPullRequestThreads(resolved.context, resolved.repo, resolved.pat, pullRequest.id);

        // --thread is a selector, not a filter: asking for a thread that isn't
        // on this pull request is an error, not an empty listing, so a caller
        // re-reading a thread after editing it notices immediately.
        if (threadFilter !== null && !fetchedThreads.some((thread) => thread.id === threadFilter)) {
          writeError(`Thread #${threadFilter} not found on pull request #${pullRequest.id}.`, EXIT_NOT_FOUND);
          return;
        }

        const allThreads = threadFilter === null
          ? fetchedThreads
          : fetchedThreads.filter((thread) => thread.id === threadFilter);

        const threads = allThreads
          .filter(
            (thread) =>
              (!hideResolved || !isThreadResolved(thread.status)) &&
              (!codeRelatedOnly || thread.threadContext !== null),
          )
          .map((thread) => shapeThreadForOutput(thread, { excludeSystem, maxChars, contains: options.contains }))
          // A thread whose comments were all system-generated has nothing left
          // to show, so it drops out of the listing entirely.
          .filter((thread): thread is ActiveCommentThread => thread !== null);
        const result: PullRequestCommentsResult = { branch: branchLabel, pullRequest, threads };

        if (options.json) {
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
          return;
        }

        if (threads.length === 0) {
          if (allThreads.length > 0 && (hideResolved || codeRelatedOnly || excludeSystem || options.contains !== undefined)) {
            const filters: string[] = [];
            if (options.contains !== undefined) {
              filters.push('matching');
            }
            if (codeRelatedOnly) {
              filters.push('code-related');
            }
            if (hideResolved) {
              filters.push('unresolved');
            }
            if (excludeSystem) {
              filters.push('non-system');
            }
            process.stdout.write(
              `Pull request #${pullRequest.id} has no ${filters.join(' ')} comment threads (filtered from ${allThreads.length} thread${allThreads.length === 1 ? '' : 's'}).\n`,
            );
          } else {
            process.stdout.write(`Pull request #${pullRequest.id} has no comment threads.\n`);
          }
          return;
        }

        process.stdout.write(`${formatThreads(pullRequest.id, pullRequest.title, threads)}\n`);
      } catch (err) {
        handlePrCommandError(err, context, 'read');
      }
    });

  command.addCommand(createPrCommentsReplyCommand());
  command.addCommand(createPrCommentsAddCommand());
  command.addCommand(createPrCommentsEditCommand());
  return command;
}

// Shared resolver for the two new state-change subcommands — returns the
// target PR (by --pr-number or current branch), the resolved context, and
// the raw threadId after validation. Callers use this to look up the
// current thread status before deciding whether to PATCH.
interface ResolvedPullRequestTarget {
  context: AzdoContext;
  repo: string;
  pat: AuthCredential;
  pullRequest: BranchPullRequestMatch;
}

interface ResolvedThreadTarget extends ResolvedPullRequestTarget {
  threadId: number;
}

// Resolves the pull request a write command targets: either the explicit
// --pr-number or the single open PR of the current branch. Returns null when
// resolution failed — the error is already on stderr and the exit code set.
async function resolvePullRequestTarget(
  options: PrCommandOptions,
): Promise<ResolvedPullRequestTarget | null> {
  validateOrgProjectPair(options);

  let explicitPrId: number | null = null;
  if (options.prNumber !== undefined) {
    explicitPrId = parsePositivePrNumber(options.prNumber);
    if (explicitPrId === null) {
      writeError(`Invalid --pr-number "${options.prNumber}"; expected a positive integer.`);
      return null;
    }
  }

  const resolved = await resolvePrCommandContext(options, { requireBranch: explicitPrId === null });

  let pullRequest: BranchPullRequestMatch;
  if (explicitPrId !== null) {
    try {
      pullRequest = await getPullRequestById(resolved.context, resolved.repo, resolved.pat, explicitPrId);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('NOT_FOUND')) {
        writeError(`Pull request #${explicitPrId} not found in ${resolved.context.org}/${resolved.context.project}/${resolved.repo}.`, EXIT_NOT_FOUND);
        return null;
      }
      throw err;
    }
  } else {
    const pullRequests = await listPullRequests(resolved.context, resolved.repo, resolved.pat, resolved.branch!, {
      status: 'active',
    });
    if (pullRequests.length === 0) {
      writeContractError(autoDetectZeroMatch(resolved.branch!));
      return null;
    }
    if (pullRequests.length > 1) {
      writeContractError(autoDetectMultiMatch(resolved.branch!, pullRequests.map((pr) => pr.id)));
      return null;
    }
    pullRequest = pullRequests[0];
  }

  return { context: resolved.context, repo: resolved.repo, pat: resolved.pat, pullRequest };
}

async function resolveThreadTarget(
  threadIdRaw: string,
  options: PrCommandOptions,
): Promise<ResolvedThreadTarget | null> {
  // The thread id is validated before any network call, so a typo never costs
  // a round trip.
  const threadId = parsePositivePrNumber(threadIdRaw);
  if (threadId === null) {
    validateOrgProjectPair(options);
    writeError(`Invalid thread id "${threadIdRaw}"; expected a positive integer.`);
    return null;
  }

  const target = await resolvePullRequestTarget(options);
  if (target === null) {
    return null;
  }

  return { ...target, threadId };
}

interface ThreadStateChangeResult {
  pullRequestId: number;
  threadId: number;
  // When noop is true, this is the thread's ACTUAL backend status at the
  // moment the command ran (e.g. "wontFix", "closed", "pending") — not the
  // nominal target. When noop is false, this is the new status after the
  // successful PATCH ("active" or "fixed").
  status: string;
  noop: boolean;
}

async function runThreadStateChange(
  threadIdRaw: string,
  options: PrCommandOptions,
  direction: 'resolve' | 'reopen',
): Promise<void> {
  let context: AzdoContext | undefined;

  try {
    const target = await resolveThreadTarget(threadIdRaw, options);
    if (target === null) {
      return;
    }
    context = target.context;

    const threads = await getPullRequestThreads(target.context, target.repo, target.pat, target.pullRequest.id);
    const thread = threads.find((t) => t.id === target.threadId);
    if (!thread) {
      writeError(`Thread #${target.threadId} not found on pull request #${target.pullRequest.id}.`, EXIT_NOT_FOUND);
      return;
    }

    const alreadyInTargetState = direction === 'resolve'
      ? isThreadResolved(thread.status)
      : !isThreadResolved(thread.status);
    const targetStatus: 'active' | 'fixed' = direction === 'resolve' ? 'fixed' : 'active';

    if (alreadyInTargetState) {
      const humanLabel = direction === 'resolve' ? 'resolved' : 'active';
      // Report the thread's actual backend status so automation built on
      // --json can distinguish e.g. "wontFix" / "closed" / "byDesign"
      // no-ops from a plain "fixed" one.
      const noopResult: ThreadStateChangeResult = {
        pullRequestId: target.pullRequest.id,
        threadId: target.threadId,
        status: thread.status,
        noop: true,
      };
      if (options.json) {
        process.stdout.write(`${JSON.stringify(noopResult, null, 2)}\n`);
        return;
      }
      process.stdout.write(`Thread #${target.threadId} is already ${humanLabel} on pull request #${target.pullRequest.id} (current status: ${thread.status}).\n`);
      return;
    }

    const updated = await patchThreadStatus(
      target.context,
      target.repo,
      target.pat,
      target.pullRequest.id,
      target.threadId,
      targetStatus,
    );
    const result: ThreadStateChangeResult = {
      pullRequestId: target.pullRequest.id,
      threadId: target.threadId,
      status: targetStatus,
      noop: false,
    };
    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    const verb = direction === 'resolve' ? 'resolved' : 'reopened';
    process.stdout.write(`Thread #${target.threadId} ${verb} on pull request #${target.pullRequest.id} (status: ${updated.status}).\n`);
  } catch (err) {
    handlePrCommandError(err, context, 'write');
  }
}

export function createPrCommentResolveCommand(): Command {
  const command = new Command('comment-resolve');
  withCommonPrOptions(configureUnwrappedHelp(command))
    .description('Mark a pull request comment thread as resolved')
    .argument('<threadId>', 'numeric id of the thread to resolve')
    .option('--pr-number <N>', PR_NUMBER_HELP)
    .option('--json', 'output JSON')
    .action(async (threadIdRaw: string, options: PrCommandOptions) => {
      await runThreadStateChange(threadIdRaw, options, 'resolve');
    });
  return command;
}

export function createPrCommentReopenCommand(): Command {
  const command = new Command('comment-reopen');
  withCommonPrOptions(configureUnwrappedHelp(command))
    .description('Reopen (set to active) a previously resolved pull request comment thread')
    .argument('<threadId>', 'numeric id of the thread to reopen')
    .option('--pr-number <N>', PR_NUMBER_HELP)
    .option('--json', 'output JSON')
    .action(async (threadIdRaw: string, options: PrCommandOptions) => {
      await runThreadStateChange(threadIdRaw, options, 'reopen');
    });
  return command;
}

// Flat JSON shape emitted by `azdo pr comments reply --json` and its alias.
interface PrCommentReplyResult {
  pullRequestId: number;
  threadId: number;
  commentId: number;
  content: string;
}

async function runCommentReply(
  threadIdRaw: string,
  text: string | undefined,
  options: PrCommandOptions,
): Promise<void> {
  let context: AzdoContext | undefined;

  try {
    // Keeps the 029 contract wording when no body was supplied at all, while
    // accepting the same inline-or---file input as the authoring commands.
    const trimmedText = resolveCommentBody(text, options.file, 'Reply text must not be empty.');
    if (trimmedText === null) {
      return;
    }

    const target = await resolveThreadTarget(threadIdRaw, options);
    if (target === null) {
      return;
    }
    context = target.context;

    const threads = await getPullRequestThreads(target.context, target.repo, target.pat, target.pullRequest.id);
    const thread = threads.find((t) => t.id === target.threadId);
    if (!thread) {
      writeError(`Thread #${target.threadId} not found on pull request #${target.pullRequest.id}.`, EXIT_NOT_FOUND);
      return;
    }

    const posted = await postThreadComment(
      target.context,
      target.repo,
      target.pat,
      target.pullRequest.id,
      target.threadId,
      trimmedText,
    );

    const result: PrCommentReplyResult = {
      pullRequestId: target.pullRequest.id,
      threadId: target.threadId,
      commentId: posted.id,
      content: posted.content,
    };

    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    process.stdout.write(`Reply posted to thread #${target.threadId} on pull request #${target.pullRequest.id}.\n`);
  } catch (err) {
    handlePrCommandError(err, context, 'write');
  }
}

// Both the canonical `pr comments reply` and its `pr comment-reply` alias are
// registered from this one definition, so the two can never drift apart.
function buildCommentReplyCommand(name: string, description: string): Command {
  const command = new Command(name);
  withCommonPrOptions(configureUnwrappedHelp(command))
    .description(description)
    .argument('<threadId>', 'numeric id of the thread to reply to')
    .argument('[text]', 'text of the reply; omit when using --file')
    .option('--file <path>', 'read the reply body from a UTF-8 file instead of the inline argument')
    .option('--pr-number <N>', PR_NUMBER_HELP)
    .option('--json', 'output JSON')
    .action(async (threadIdRaw: string, text: string | undefined, _options: PrCommandOptions, command: Command) => {
      await runCommentReply(threadIdRaw, text, mergedPrOptions(command));
    });
  return command;
}

export function createPrCommentsReplyCommand(): Command {
  return buildCommentReplyCommand('reply', 'Post a reply to a pull request comment thread');
}

export function createPrCommentReplyCommand(): Command {
  return buildCommentReplyCommand(
    'comment-reply',
    'Post a reply to a pull request comment thread (alias of "azdo pr comments reply")',
  );
}

// Thread statuses accepted by `pr comments add --status`. Omitting the flag
// posts a plain, non-resolvable overview comment.
const CREATABLE_THREAD_STATUSES: CreatableThreadStatus[] = [
  'active',
  'fixed',
  'wontFix',
  'closed',
  'byDesign',
  'pending',
];

// Flat JSON shape emitted by `azdo pr comments add --json` and its alias. On a
// dry run `threadId` / `commentId` are null: nothing was created, so there are
// no server-assigned ids to report.
interface PrCommentAddResult {
  pullRequestId: number;
  threadId: number | null;
  commentId: number | null;
  status: string | null;
  content: string;
  dryRun: boolean;
}

async function runCommentAdd(
  text: string | undefined,
  options: PrCommandOptions,
): Promise<void> {
  let context: AzdoContext | undefined;

  try {
    const body = resolveCommentBody(text, options.file);
    if (body === null) {
      return;
    }

    let status: CreatableThreadStatus | undefined;
    if (options.status !== undefined) {
      const match = CREATABLE_THREAD_STATUSES.find((candidate) => candidate === options.status);
      if (match === undefined) {
        writeError(
          `Invalid --status "${options.status}"; expected one of ${CREATABLE_THREAD_STATUSES.join(', ')}.`,
        );
        return;
      }
      status = match;
    }

    const target = await resolvePullRequestTarget(options);
    if (target === null) {
      return;
    }
    context = target.context;

    if (options.dryRun === true) {
      const dryResult: PrCommentAddResult = {
        pullRequestId: target.pullRequest.id,
        threadId: null,
        commentId: null,
        status: status ?? null,
        content: body,
        dryRun: true,
      };
      if (options.json) {
        process.stdout.write(`${JSON.stringify(dryResult, null, 2)}\n`);
        return;
      }
      const statusSuffix = status === undefined ? '' : ` with status ${status}`;
      process.stdout.write(
        `Dry run: would post a new comment thread${statusSuffix} on pull request #${target.pullRequest.id} (${body.length} chars).\n${body}\n`,
      );
      return;
    }

    const thread = await createPullRequestThread(
      target.context,
      target.repo,
      target.pat,
      target.pullRequest.id,
      body,
      status,
    );
    const created = thread.comments[0];
    const result: PrCommentAddResult = {
      pullRequestId: target.pullRequest.id,
      threadId: thread.id,
      commentId: created?.id ?? null,
      status: thread.status,
      content: created?.content ?? body,
      dryRun: false,
    };

    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    process.stdout.write(
      `Comment posted to pull request #${target.pullRequest.id} (thread #${thread.id}).\n`,
    );
  } catch (err) {
    handlePrCommandError(err, context, 'write');
  }
}

function buildCommentAddCommand(name: string, description: string): Command {
  const command = new Command(name);
  withCommonPrOptions(configureUnwrappedHelp(command))
    .description(description)
    .argument('[text]', 'body of the new comment; omit when using --file')
    .option('--file <path>', 'read the comment body from a UTF-8 file instead of the inline argument')
    .option(
      '--status <status>',
      `thread status (${CREATABLE_THREAD_STATUSES.join(' | ')}); omit for a plain, non-resolvable comment`,
    )
    .option('--dry-run', 'resolve the target pull request and print what would be posted, without writing anything')
    .option('--pr-number <N>', PR_NUMBER_HELP)
    .option('--json', 'output JSON')
    .action(async (text: string | undefined, _options: PrCommandOptions, command: Command) => {
      await runCommentAdd(text, mergedPrOptions(command));
    });
  return command;
}

export function createPrCommentsAddCommand(): Command {
  return buildCommentAddCommand('add', 'Post a new comment thread on the pull request overview');
}

export function createPrCommentAddCommand(): Command {
  return buildCommentAddCommand(
    'comment-add',
    'Post a new comment thread on the pull request overview (alias of "azdo pr comments add")',
  );
}

// Flat JSON shape emitted by `azdo pr comments edit --json` and its alias.
// `previousContent` lets a caller diff or roll back what was replaced.
interface PrCommentEditResult {
  pullRequestId: number;
  threadId: number;
  commentId: number;
  previousContent: string;
  content: string;
  dryRun: boolean;
}

// Fetches the thread holding the comment to edit, translating a 404 into the
// thread-not-found message. Returns null when the error was already reported.
async function fetchThreadForEdit(target: ResolvedThreadTarget): Promise<ActiveCommentThread | null> {
  try {
    return await getPullRequestThread(
      target.context,
      target.repo,
      target.pat,
      target.pullRequest.id,
      target.threadId,
    );
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('NOT_FOUND')) {
      writeError(`Thread #${target.threadId} not found on pull request #${target.pullRequest.id}.`, EXIT_NOT_FOUND);
      return null;
    }
    throw err;
  }
}

// Picks the comment to rewrite: the one named by --comment-id, or else the
// thread's first comment — the one that created the thread, which is what a
// "correct my own post" flow means. Returns null after reporting why nothing
// matched.
function selectEditableComment(
  thread: ActiveCommentThread,
  explicitCommentId: number | null,
  target: ResolvedThreadTarget,
): ActivePullRequestComment | null {
  if (explicitCommentId !== null) {
    const match = thread.comments.find((comment) => comment.id === explicitCommentId);
    if (match === undefined) {
      writeError(`Comment #${explicitCommentId} not found in thread #${target.threadId} on pull request #${target.pullRequest.id}.`, EXIT_NOT_FOUND);
      return null;
    }
    return match;
  }

  const first = [...thread.comments].sort((a, b) => a.id - b.id)[0];
  if (first === undefined) {
    writeError(`Thread #${target.threadId} on pull request #${target.pullRequest.id} has no editable comment.`, EXIT_NOT_FOUND);
    return null;
  }
  return first;
}

// Emits an edit result as JSON or as the one-line human summary; the dry-run
// variant also prints the body that would have replaced the current one.
function reportEditResult(result: PrCommentEditResult, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}
`);
    return;
  }

  if (result.dryRun) {
    process.stdout.write(
      `Dry run: would replace comment #${result.commentId} in thread #${result.threadId} on pull request #${result.pullRequestId} (${result.previousContent.length} chars -> ${result.content.length} chars).
${result.content}
`,
    );
    return;
  }

  process.stdout.write(
    `Comment #${result.commentId} updated in thread #${result.threadId} on pull request #${result.pullRequestId}.
`,
  );
}

async function runCommentEdit(
  threadIdRaw: string,
  text: string | undefined,
  options: PrCommandOptions,
): Promise<void> {
  let context: AzdoContext | undefined;

  try {
    const body = resolveCommentBody(text, options.file);
    if (body === null) {
      return;
    }

    let explicitCommentId: number | null = null;
    if (options.commentId !== undefined) {
      explicitCommentId = parsePositivePrNumber(options.commentId);
      if (explicitCommentId === null) {
        writeError(`Invalid --comment-id "${options.commentId}"; expected a positive integer.`);
        return;
      }
    }

    const target = await resolveThreadTarget(threadIdRaw, options);
    if (target === null) {
      return;
    }
    context = target.context;

    const thread = await fetchThreadForEdit(target);
    if (thread === null) {
      return;
    }

    const existing = selectEditableComment(thread, explicitCommentId, target);
    if (existing === null) {
      return;
    }

    if (options.dryRun === true) {
      reportEditResult(
        {
          pullRequestId: target.pullRequest.id,
          threadId: target.threadId,
          commentId: existing.id,
          previousContent: existing.content,
          content: body,
          dryRun: true,
        },
        options.json === true,
      );
      return;
    }

    const updated = await updateThreadComment(
      target.context,
      target.repo,
      target.pat,
      target.pullRequest.id,
      target.threadId,
      existing.id,
      body,
    );

    reportEditResult(
      {
        pullRequestId: target.pullRequest.id,
        threadId: target.threadId,
        commentId: updated.id,
        previousContent: existing.content,
        content: updated.content,
        dryRun: false,
      },
      options.json === true,
    );
  } catch (err) {
    handlePrCommandError(err, context, 'write');
  }
}

function buildCommentEditCommand(name: string, description: string): Command {
  const command = new Command(name);
  withCommonPrOptions(configureUnwrappedHelp(command))
    .description(description)
    .argument('<threadId>', 'numeric id of the thread holding the comment')
    .argument('[text]', 'new comment body; omit when using --file')
    .option('--comment-id <N>', 'numeric id of the comment to edit; defaults to the thread\'s first comment')
    .option('--file <path>', 'read the new body from a UTF-8 file instead of the inline argument')
    .option('--dry-run', 'print the replacement body plus the current/new lengths, without writing anything (--json also returns previousContent)')
    .option('--pr-number <N>', PR_NUMBER_HELP)
    .option('--json', 'output JSON')
    .action(async (threadIdRaw: string, text: string | undefined, _options: PrCommandOptions, command: Command) => {
      await runCommentEdit(threadIdRaw, text, mergedPrOptions(command));
    });
  return command;
}

export function createPrCommentsEditCommand(): Command {
  return buildCommentEditCommand('edit', 'Edit an existing pull request comment in place');
}

export function createPrCommentEditCommand(): Command {
  return buildCommentEditCommand(
    'comment-edit',
    'Edit an existing pull request comment in place (alias of "azdo pr comments edit")',
  );
}

const LIST_STATUS_VALUES: readonly string[] = ['active', 'completed', 'abandoned', 'all'];
const DEFAULT_LIST_TOP = 25;

interface PrListResult {
  repository: string;
  branch: string | null;
  status: string;
  pullRequests: BranchPullRequestMatch[];
}

function formatPullRequestListEntry(pullRequest: BranchPullRequestMatch): string {
  return [
    `#${pullRequest.id} [${pullRequest.status}] ${pullRequest.title}`,
    `  ${formatBranchName(pullRequest.sourceRefName)} -> ${formatBranchName(pullRequest.targetRefName)}`,
    `  Author: ${pullRequest.createdBy ?? 'Unknown'}`,
    `  ${pullRequest.url ?? '—'}`,
  ].join('\n');
}

export function createPrListCommand(): Command {
  const command = new Command('list');

  withCommonPrOptions(configureUnwrappedHelp(command))
    .description('List pull requests in the repository, optionally filtered by source branch')
    .option('--branch <name>', 'only pull requests whose source branch is this one (with or without the refs/heads/ prefix)')
    .option('--status <status>', `pull request status filter (${LIST_STATUS_VALUES.join(' | ')})`, 'active')
    .option('--top <N>', `maximum number of pull requests to return (default ${DEFAULT_LIST_TOP})`)
    .option('--json', 'output JSON')
    .action(async (options: PrCommandOptions & { branch?: string; top?: string }) => {
      validateOrgProjectPair(options);

      const status = options.status ?? 'active';
      if (!LIST_STATUS_VALUES.includes(status)) {
        writeError(`Invalid --status "${status}"; expected one of ${LIST_STATUS_VALUES.join(', ')}.`);
        return;
      }

      let top = DEFAULT_LIST_TOP;
      if (options.top !== undefined) {
        const parsed = parsePositivePrNumber(options.top);
        if (parsed === null) {
          writeError(`Invalid --top "${options.top}"; expected a positive integer.`);
          return;
        }
        top = parsed;
      }

      // The branch filter is explicit here — `pr list` never falls back to the
      // current branch, because that is exactly what `pr status` already does.
      const branch = options.branch?.trim().replace(/^refs\/heads\//, '') || null;

      let context: AzdoContext | undefined;

      try {
        const resolved = await resolvePrCommandContext(options, { requireBranch: false });
        context = resolved.context;

        const pullRequests = await listRepositoryPullRequests(resolved.context, resolved.repo, resolved.pat, {
          sourceBranch: branch ?? undefined,
          status,
          top,
        });

        const result: PrListResult = {
          repository: resolved.repo,
          branch,
          status,
          pullRequests,
        };

        if (options.json) {
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
          return;
        }

        if (pullRequests.length === 0) {
          const branchSuffix = branch === null ? '' : ` for branch ${branch}`;
          process.stdout.write(`No ${status} pull request found in ${resolved.repo}${branchSuffix}.\n`);
          return;
        }

        process.stdout.write(`${pullRequests.map(formatPullRequestListEntry).join('\n\n')}\n`);
      } catch (err) {
        handlePrCommandError(err, context, 'read');
      }
    });

  return command;
}

// Flat JSON shape emitted by `pr work-items link|unlink --json`.
interface PrWorkItemLinkResult {
  pullRequestId: number;
  workItemId: number;
  noop: boolean;
}

async function runWorkItemLinkChange(
  workItemIdRaw: string,
  options: PrCommandOptions,
  direction: 'link' | 'unlink',
): Promise<void> {
  let context: AzdoContext | undefined;

  try {
    const workItemId = parsePositivePrNumber(workItemIdRaw);
    if (workItemId === null) {
      validateOrgProjectPair(options);
      writeError(`Invalid work item id "${workItemIdRaw}"; expected a positive integer.`);
      return;
    }

    const target = await resolvePullRequestTarget(options);
    if (target === null) {
      return;
    }
    context = target.context;

    let outcome;
    try {
      outcome = direction === 'link'
        ? await linkWorkItemToPullRequest(target.context, target.repo, target.pat, target.pullRequest.id, workItemId)
        : await unlinkWorkItemFromPullRequest(target.context, target.repo, target.pat, target.pullRequest.id, workItemId);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('NOT_FOUND')) {
        writeError(`Work item #${workItemId} not found in ${target.context.org}/${target.context.project}.`, EXIT_NOT_FOUND);
        return;
      }
      throw err;
    }

    const result: PrWorkItemLinkResult = {
      pullRequestId: outcome.pullRequestId,
      workItemId: outcome.workItemId,
      noop: outcome.noop,
    };

    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    if (direction === 'link') {
      process.stdout.write(
        outcome.noop
          ? `Work item #${workItemId} is already linked to pull request #${outcome.pullRequestId}.\n`
          : `Linked work item #${workItemId} to pull request #${outcome.pullRequestId}.\n`,
      );
    } else {
      process.stdout.write(
        outcome.noop
          ? `Work item #${workItemId} was not linked to pull request #${outcome.pullRequestId}.\n`
          : `Unlinked work item #${workItemId} from pull request #${outcome.pullRequestId}.\n`,
      );
    }
  } catch (err) {
    handlePrCommandError(err, context, 'write');
  }
}

function buildWorkItemLinkCommand(name: string, description: string, direction: 'link' | 'unlink'): Command {
  const command = new Command(name);
  withCommonPrOptions(configureUnwrappedHelp(command))
    .description(description)
    .argument('<workItemId>', 'numeric id of the work item')
    .option('--pr-number <N>', PR_NUMBER_HELP)
    .option('--json', 'output JSON')
    .action(async (workItemIdRaw: string, _options: PrCommandOptions, command: Command) => {
      await runWorkItemLinkChange(workItemIdRaw, mergedPrOptions(command), direction);
    });
  return command;
}

export function createPrWorkItemsCommand(): Command {
  const command = new Command('work-items');
  command.description('Manage work items linked to a pull request');
  command.addCommand(buildWorkItemLinkCommand('link', 'Link a work item to the pull request', 'link'));
  command.addCommand(buildWorkItemLinkCommand('unlink', 'Unlink a work item from the pull request', 'unlink'));
  return command;
}

// Flat JSON shape emitted by `pr reviewers add|remove --json`.
interface PrReviewerResult {
  pullRequestId: number;
  reviewer: { id: string; displayName: string | null; uniqueName: string | null; isRequired: boolean } | null;
  noop: boolean;
}

async function runReviewerAdd(
  reviewer: string,
  options: PrCommandOptions,
): Promise<void> {
  let context: AzdoContext | undefined;

  try {
    const target = await resolvePullRequestTarget(options);
    if (target === null) {
      return;
    }
    context = target.context;

    let identity;
    try {
      identity = await resolveReviewerIdentity(target.context.org, target.pat, reviewer);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('RESOLVE_FAILED:')) {
        writeError(`Reviewer "${reviewer}" could not be resolved to an Azure DevOps identity.`);
        return;
      }
      throw err;
    }

    const isRequired = options.required === true;
    const existingReviewers = await getPullRequestReviewers(target.context, target.repo, target.pat, target.pullRequest.id);
    const existing = existingReviewers.find((reviewer) => reviewer.id === identity.id);
    const noop = existing?.isRequired === isRequired;

    const added = noop
      ? existing
      : await addOrUpdatePullRequestReviewer(
        target.context,
        target.repo,
        target.pat,
        target.pullRequest.id,
        identity.id,
        isRequired,
      );

    const result: PrReviewerResult = {
      pullRequestId: target.pullRequest.id,
      reviewer: { id: added.id, displayName: added.displayName, uniqueName: added.uniqueName, isRequired: added.isRequired },
      noop,
    };

    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    if (noop) {
      const label = added.displayName ?? added.uniqueName ?? reviewer;
      const kind = added.isRequired ? 'required' : 'optional';
      process.stdout.write(`${label} is already a ${kind} reviewer on pull request #${target.pullRequest.id}.\n`);
      return;
    }

    const label = added.displayName ?? added.uniqueName ?? reviewer;
    const kind = added.isRequired ? 'required' : 'optional';
    process.stdout.write(`Added ${label} as a ${kind} reviewer on pull request #${target.pullRequest.id}.\n`);
  } catch (err) {
    handlePrCommandError(err, context, 'write');
  }
}

async function runReviewerRemove(reviewer: string, options: PrCommandOptions): Promise<void> {
  let context: AzdoContext | undefined;

  try {
    const target = await resolvePullRequestTarget(options);
    if (target === null) {
      return;
    }
    context = target.context;

    let identity;
    try {
      identity = await resolveReviewerIdentity(target.context.org, target.pat, reviewer);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('RESOLVE_FAILED:')) {
        writeError(`Reviewer "${reviewer}" could not be resolved to an Azure DevOps identity.`);
        return;
      }
      throw err;
    }

    const outcome = await removePullRequestReviewer(target.context, target.repo, target.pat, target.pullRequest.id, identity.id);

    const result: PrReviewerResult = {
      pullRequestId: target.pullRequest.id,
      reviewer: outcome.reviewer
        ? { id: outcome.reviewer.id, displayName: outcome.reviewer.displayName, uniqueName: outcome.reviewer.uniqueName, isRequired: outcome.reviewer.isRequired }
        : null,
      noop: outcome.noop,
    };

    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    if (outcome.noop) {
      process.stdout.write(`${reviewer} is not a reviewer on pull request #${target.pullRequest.id}.\n`);
      return;
    }

    const label = outcome.reviewer?.displayName ?? outcome.reviewer?.uniqueName ?? reviewer;
    process.stdout.write(`Removed ${label} from pull request #${target.pullRequest.id}.\n`);
  } catch (err) {
    handlePrCommandError(err, context, 'write');
  }
}

export function createPrReviewersCommand(): Command {
  const command = new Command('reviewers');
  command.description('Manage pull request reviewers');

  const add = new Command('add');
  withCommonPrOptions(configureUnwrappedHelp(add))
    .description('Add a reviewer to the pull request (optional by default)')
    .argument('<reviewer>', 'reviewer email or unique name')
    .option('--required', 'mark the reviewer as required instead of optional')
    .option('--pr-number <N>', PR_NUMBER_HELP)
    .option('--json', 'output JSON')
    .action(async (reviewer: string, _options: PrCommandOptions, command: Command) => {
      await runReviewerAdd(reviewer, mergedPrOptions(command));
    });
  command.addCommand(add);

  const remove = new Command('remove');
  withCommonPrOptions(configureUnwrappedHelp(remove))
    .description('Remove a reviewer from the pull request')
    .argument('<reviewer>', 'reviewer email or unique name')
    .option('--pr-number <N>', PR_NUMBER_HELP)
    .option('--json', 'output JSON')
    .action(async (reviewer: string, _options: PrCommandOptions, command: Command) => {
      await runReviewerRemove(reviewer, mergedPrOptions(command));
    });
  command.addCommand(remove);

  return command;
}

export function createPrCommand(): Command {
  const command = new Command('pr');
  command.description('Manage Azure DevOps pull requests');
  command.addCommand(createPrListCommand());
  command.addCommand(createPrStatusCommand());
  command.addCommand(createPrOpenCommand());
  command.addCommand(createPrCommentsCommand());
  command.addCommand(createPrCommentResolveCommand());
  command.addCommand(createPrCommentReopenCommand());
  command.addCommand(createPrCommentReplyCommand());
  command.addCommand(createPrCommentAddCommand());
  command.addCommand(createPrWorkItemsCommand());
  command.addCommand(createPrReviewersCommand());
  command.addCommand(createPrCommentEditCommand());
  return command;
}
