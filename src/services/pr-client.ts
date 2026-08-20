import type { AuthCredential, AzdoContext } from '../types/work-item.js';
import { authHeaders, fetchWithErrors } from './azdo-client.js';
import type { AzdoBuild, AzdoBuildListResponse } from '../types/pipeline.js';
import type {
  ActiveCommentThread,
  ActivePullRequestComment,
  AzdoCreatedComment,
  AzdoPolicyEvaluation,
  AzdoPolicyEvaluationListResponse,
  AzdoPrListResponse,
  AzdoPrStatusListResponse,
  AzdoProject,
  AzdoPullRequest,
  AzdoPullRequestStatus,
  AzdoThread,
  AzdoThreadListResponse,
  BranchPullRequestMatch,
  CreatableThreadStatus,
  PostedPrComment,
  PullRequestCheck,
  PullRequestOpenRequest,
  PullRequestOpenResult,
  PullRequestThreadCreateRequest,
} from '../types/pull-request.js';

function buildPullRequestsUrl(
  context: AzdoContext,
  repo: string,
  sourceBranch: string | null,
  opts?: { status?: string; targetBranch?: string; top?: number },
): URL {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}/_apis/git/repositories/${encodeURIComponent(repo)}/pullrequests`,
  );
  url.searchParams.set('api-version', '7.1');
  // A null source branch means "every pull request in the repository" — the
  // criteria key is omitted entirely rather than sent empty.
  if (sourceBranch !== null) {
    url.searchParams.set('searchCriteria.sourceRefName', `refs/heads/${sourceBranch}`);
  }

  if (opts?.status) {
    url.searchParams.set('searchCriteria.status', opts.status);
  }

  if (opts?.targetBranch) {
    url.searchParams.set('searchCriteria.targetRefName', `refs/heads/${opts.targetBranch}`);
  }

  if (opts?.top !== undefined) {
    url.searchParams.set('$top', String(opts.top));
  }

  return url;
}

function buildPullRequestStatusesUrl(context: AzdoContext, repo: string, prId: number): URL {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}/_apis/git/repositories/${encodeURIComponent(repo)}/pullRequests/${prId}/statuses`,
  );
  url.searchParams.set('api-version', '7.1');
  return url;
}

function buildProjectUrl(context: AzdoContext): URL {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/_apis/projects/${encodeURIComponent(context.project)}`,
  );
  url.searchParams.set('api-version', '7.1');
  return url;
}

function buildPolicyEvaluationsUrl(context: AzdoContext, projectId: string, prId: number): URL {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}/_apis/policy/evaluations`,
  );
  url.searchParams.set('api-version', '7.1');
  // The PR is identified to the policy engine by a CodeReview artifact id that
  // embeds the project GUID and the pull request id.
  url.searchParams.set('artifactId', `vstfs:///CodeReview/CodeReviewId/${projectId}/${prId}`);
  return url;
}

function buildPullRequestBuildsUrl(context: AzdoContext, prId: number): URL {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}/_apis/build/builds`,
  );
  url.searchParams.set('branchName', `refs/pull/${prId}/merge`);
  url.searchParams.set('queryOrder', 'queueTimeDescending');
  url.searchParams.set('$top', '50');
  url.searchParams.set('api-version', '7.1');
  return url;
}

// Azure DevOps returns `_links.web` only on some payloads — the pull request
// LIST response omits it — so the browser URL is built deterministically and
// the API's own link is preferred whenever it is present. Callers were
// otherwise left to rebuild this string themselves from a null field.
function buildPullRequestWebUrl(context: AzdoContext, repo: string, prId: number): string {
  return `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}/_git/${encodeURIComponent(repo)}/pullrequest/${prId}`;
}

function mapPullRequest(
  context: AzdoContext,
  repo: string,
  pullRequest: AzdoPullRequest,
): BranchPullRequestMatch {
  return {
    id: pullRequest.pullRequestId,
    title: pullRequest.title,
    repository: repo,
    sourceRefName: pullRequest.sourceRefName,
    targetRefName: pullRequest.targetRefName,
    status: pullRequest.status,
    createdBy: pullRequest.createdBy?.displayName ?? null,
    url: pullRequest._links?.web?.href ?? buildPullRequestWebUrl(context, repo, pullRequest.pullRequestId),
    description: pullRequest.description?.trim() || null,
    createdByUniqueName: pullRequest.createdBy?.uniqueName ?? null,
    createdById: pullRequest.createdBy?.id ?? null,
  };
}

function mapPullRequestCheckName(status: AzdoPullRequestStatus): string {
  const genre = status.context?.genre?.trim();
  const name = status.context?.name?.trim();

  if (genre && name) {
    return `${genre}/${name}`;
  }

  if (name) {
    return name;
  }

  if (genre) {
    return genre;
  }

  return `Status #${status.id}`;
}

function mapPullRequestCheck(status: AzdoPullRequestStatus): PullRequestCheck | null {
  if (status.state === 'notApplicable' || status.state === 'notSet') {
    return null;
  }

  return {
    id: status.id,
    state: status.state,
    name: mapPullRequestCheckName(status),
    description: status.description ?? null,
    targetUrl: status.targetUrl ?? null,
    createdBy: status.createdBy?.displayName ?? null,
    createdAt: status.creationDate ?? null,
    updatedAt: status.updatedDate ?? null,
    source: 'status',
  };
}

// Branch policy evaluation status values map onto the same check states the
// status formatter already renders. `notApplicable`/`notSet` evaluations carry
// no signal, so we drop them — mirroring mapPullRequestCheck().
function mapPolicyEvaluationState(status: string | undefined): string | null {
  switch (status) {
    case 'approved':
      return 'succeeded';
    case 'rejected':
      return 'failed';
    case 'running':
    case 'queued':
      return 'pending';
    case 'notApplicable':
    case 'notSet':
    case undefined:
      return null;
    default:
      // Unknown future states pass through verbatim so we never hide a check.
      return status;
  }
}

function mapBuildToCheckState(build: AzdoBuild): string {
  if (build.status !== 'completed') {
    return 'pending';
  }
  switch (build.result) {
    case 'succeeded':
    case 'partiallySucceeded':
      return 'succeeded';
    case 'failed':
      return 'failed';
    case 'canceled':
      return 'error';
    default:
      return 'pending';
  }
}

function mapPolicyEvaluationName(evaluation: AzdoPolicyEvaluation): string {
  const display =
    evaluation.configuration?.settings?.displayName?.trim() ||
    evaluation.configuration?.type?.displayName?.trim();
  if (display) {
    return display;
  }
  return `Policy ${evaluation.configuration?.id ?? evaluation.evaluationId ?? '?'}`;
}

function mapPolicyEvaluationCheck(evaluation: AzdoPolicyEvaluation): PullRequestCheck | null {
  const state = mapPolicyEvaluationState(evaluation.status);
  if (state === null) {
    return null;
  }

  return {
    id: evaluation.configuration?.id ?? 0,
    state,
    name: mapPolicyEvaluationName(evaluation),
    description: null,
    targetUrl: null,
    createdBy: null,
    createdAt: null,
    updatedAt: null,
    source: 'policy',
    isBlocking: evaluation.configuration?.isBlocking ?? null,
  };
}

function mapComment(comment: AzdoThread['comments'][number]): ActivePullRequestComment | null {
  const content = comment.content?.trim();
  if (comment.isDeleted || !content) {
    return null;
  }

  return {
    id: comment.id,
    author: comment.author?.displayName ?? null,
    content,
    publishedAt: comment.publishedDate ?? null,
    commentType: comment.commentType ?? null,
  };
}

function mapThread(thread: AzdoThread): ActiveCommentThread | null {
  // Pass every backend thread status through — the formatter renders a
  // status indicator and the command-level filter (`--hide-resolved`)
  // decides which ones to keep. We still drop threads whose only comments
  // are deleted or whitespace-only; those are metadata-only threads.
  const comments = thread.comments
    .map(mapComment)
    .filter((comment): comment is ActivePullRequestComment => comment !== null);

  if (comments.length === 0) {
    return null;
  }

  const line =
    thread.threadContext?.rightFileStart?.line ??
    thread.threadContext?.leftFileStart?.line ??
    null;

  return {
    id: thread.id,
    status: thread.status ?? 'unknown',
    threadContext: thread.threadContext?.filePath ?? null,
    line,
    comments,
  };
}

function toActiveCommentThread(thread: AzdoThread): ActiveCommentThread {
  // Unlike mapThread() this does not drop threads whose visible comments
  // list is empty; the state-change path needs to round-trip any thread
  // the PATCH call returns so callers can confirm the new status.
  const line =
    thread.threadContext?.rightFileStart?.line ??
    thread.threadContext?.leftFileStart?.line ??
    null;

  return {
    id: thread.id,
    status: thread.status ?? 'unknown',
    threadContext: thread.threadContext?.filePath ?? null,
    line,
    comments: thread.comments
      .map(mapComment)
      .filter((comment): comment is ActivePullRequestComment => comment !== null),
  };
}

const RESOLVED_THREAD_STATUSES = new Set<string>(['fixed', 'wontFix', 'closed', 'byDesign']);

// Returns true when the thread's status is one the Azure DevOps UI treats
// as settled (resolved, won't fix, closed, by design). Used by the
// --hide-resolved filter on `pr comments` and by the idempotency check in
// `pr comment-resolve` / `pr comment-reopen`.
export function isThreadResolved(status: string): boolean {
  return RESOLVED_THREAD_STATUSES.has(status);
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`HTTP_${response.status}`);
  }

  return response.json() as Promise<T>;
}

// Patches a pull request comment thread's status. Used by the CLI's
// comment-resolve / comment-reopen subcommands to flip a thread between
// 'active' and 'fixed' on the backend. Only those two status values are
// accepted at the boundary — richer backend states (wontFix, closed,
// byDesign) are visible in listings but out of scope for CLI-driven
// transitions in this iteration (per the spec's Assumptions).
export async function patchThreadStatus(
  context: AzdoContext,
  repo: string,
  cred: AuthCredential,
  prId: number,
  threadId: number,
  status: 'active' | 'fixed',
): Promise<ActiveCommentThread> {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}/_apis/git/repositories/${encodeURIComponent(repo)}/pullRequests/${prId}/threads/${threadId}`,
  );
  url.searchParams.set('api-version', '7.1');

  const response = await fetchWithErrors(url.toString(), {
    method: 'PATCH',
    headers: {
      ...authHeaders(cred),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  });
  const data = await readJsonResponse<AzdoThread>(response);
  return toActiveCommentThread(data);
}

// Fetches a single pull request by its numeric id. Used by the
// --pr-number flag on `azdo pr comments` (and related subcommands) so the
// command can target any PR without going through the current-branch
// resolution path. fetchWithErrors maps a 404 response to a NOT_FOUND
// error; callers translate that into a user-facing "PR not found"
// message.
export async function getPullRequestById(
  context: AzdoContext,
  repo: string,
  cred: AuthCredential,
  prId: number,
): Promise<BranchPullRequestMatch> {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}/_apis/git/repositories/${encodeURIComponent(repo)}/pullRequests/${prId}`,
  );
  url.searchParams.set('api-version', '7.1');

  const response = await fetchWithErrors(url.toString(), { headers: authHeaders(cred) });
  const data = await readJsonResponse<AzdoPullRequest>(response);
  return mapPullRequest(context, repo, data);
}

export async function listPullRequests(
  context: AzdoContext,
  repo: string,
  cred: AuthCredential,
  sourceBranch: string,
  opts?: { status?: string; targetBranch?: string },
): Promise<BranchPullRequestMatch[]> {
  const response = await fetchWithErrors(
    buildPullRequestsUrl(context, repo, sourceBranch, opts).toString(),
    { headers: authHeaders(cred) },
  );
  const data = await readJsonResponse<AzdoPrListResponse>(response);
  return data.value.map((pullRequest) => mapPullRequest(context, repo, pullRequest));
}

// Repository-wide pull request listing used by `azdo pr list`. Unlike
// listPullRequests() the source branch is optional: omitting it returns every
// pull request in the repository that matches the status filter, which is the
// "which PR belongs to this branch?" lookup generalised to the whole repo.
export async function listRepositoryPullRequests(
  context: AzdoContext,
  repo: string,
  cred: AuthCredential,
  opts?: { sourceBranch?: string; status?: string; top?: number },
): Promise<BranchPullRequestMatch[]> {
  const url = buildPullRequestsUrl(context, repo, opts?.sourceBranch ?? null, {
    status: opts?.status,
    top: opts?.top,
  });
  const response = await fetchWithErrors(url.toString(), { headers: authHeaders(cred) });
  const data = await readJsonResponse<AzdoPrListResponse>(response);
  return data.value.map((pullRequest) => mapPullRequest(context, repo, pullRequest));
}

export async function getPullRequestChecks(
  context: AzdoContext,
  repo: string,
  cred: AuthCredential,
  prId: number,
): Promise<PullRequestCheck[]> {
  const response = await fetchWithErrors(
    buildPullRequestStatusesUrl(context, repo, prId).toString(),
    { headers: authHeaders(cred) },
  );
  const data = await readJsonResponse<AzdoPrStatusListResponse>(response);

  return data.value
    .map(mapPullRequestCheck)
    .filter((check): check is PullRequestCheck => check !== null);
}

// Resolves the project GUID for the current context. Needed to build the
// policy-evaluation artifactId, since the PR/context only carry the project
// name. Callers should resolve once and reuse for the duration of a command.
export async function resolveProjectId(context: AzdoContext, cred: AuthCredential): Promise<string> {
  const response = await fetchWithErrors(buildProjectUrl(context).toString(), {
    headers: authHeaders(cred),
  });
  const data = await readJsonResponse<AzdoProject>(response);
  return data.id;
}

// Fetches branch policy evaluations for a PR and maps them to checks. These are
// the build-validation / required-reviewer "checks" the Azure DevOps UI shows;
// they are NOT returned by the statuses endpoint, which is why `pr status`
// merges both sources.
export async function getPullRequestPolicyEvaluations(
  context: AzdoContext,
  cred: AuthCredential,
  projectId: string,
  prId: number,
): Promise<PullRequestCheck[]> {
  const response = await fetchWithErrors(
    buildPolicyEvaluationsUrl(context, projectId, prId).toString(),
    { headers: authHeaders(cred) },
  );
  const data = await readJsonResponse<AzdoPolicyEvaluationListResponse>(response);

  return data.value
    .map(mapPolicyEvaluationCheck)
    .filter((check): check is PullRequestCheck => check !== null);
}

export async function getPullRequestBuilds(
  context: AzdoContext,
  cred: AuthCredential,
  prId: number,
): Promise<PullRequestCheck[]> {
  const response = await fetchWithErrors(buildPullRequestBuildsUrl(context, prId).toString(), {
    headers: authHeaders(cred),
  });
  const data = await readJsonResponse<AzdoBuildListResponse>(response);

  return data.value.map((build) => ({
    id: build.id,
    state: mapBuildToCheckState(build),
    name: build.definition?.name ?? `Build #${build.id}`,
    description: null,
    targetUrl: build._links?.web?.href ?? null,
    createdBy: null,
    createdAt: build.queueTime ?? null,
    updatedAt: build.finishTime ?? null,
    source: 'build' as const,
    isBlocking: null,
  }));
}

export async function openPullRequest(
  context: AzdoContext,
  repo: string,
  cred: AuthCredential,
  sourceBranch: string,
  title: string,
  description: string,
): Promise<PullRequestOpenResult> {
  const existing = await listPullRequests(context, repo, cred, sourceBranch, {
    status: 'active',
    targetBranch: 'develop',
  });

  if (existing.length === 1) {
    return {
      branch: sourceBranch,
      targetBranch: 'develop',
      created: false,
      pullRequest: existing[0],
    };
  }

  if (existing.length > 1) {
    throw new Error(`AMBIGUOUS_PRS:${existing.map((pullRequest) => pullRequest.id).join(',')}`);
  }

  const payload: PullRequestOpenRequest = {
    sourceRefName: `refs/heads/${sourceBranch}`,
    targetRefName: 'refs/heads/develop',
    title,
    description,
  };

  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}/_apis/git/repositories/${encodeURIComponent(repo)}/pullrequests`,
  );
  url.searchParams.set('api-version', '7.1');

  const response = await fetchWithErrors(url.toString(), {
    method: 'POST',
    headers: {
      ...authHeaders(cred),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await readJsonResponse<AzdoPullRequest>(response);
  return {
    branch: sourceBranch,
    targetBranch: 'develop',
    created: true,
    pullRequest: mapPullRequest(context, repo, data),
  };
}

export async function getPullRequestThreads(
  context: AzdoContext,
  repo: string,
  cred: AuthCredential,
  prId: number,
): Promise<ActiveCommentThread[]> {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}/_apis/git/repositories/${encodeURIComponent(repo)}/pullRequests/${prId}/threads`,
  );
  url.searchParams.set('api-version', '7.1');

  const response = await fetchWithErrors(url.toString(), { headers: authHeaders(cred) });
  const data = await readJsonResponse<AzdoThreadListResponse>(response);

  return data.value
    .map(mapThread)
    .filter((thread): thread is ActiveCommentThread => thread !== null);
}

// Fetches a single comment thread. Cheaper than listing every thread when the
// caller already knows the id (comment edit), and — unlike the list mapping —
// it never drops the thread just because its visible comments were filtered.
// fetchWithErrors maps a 404 to NOT_FOUND; callers translate that into a
// "thread not found" message.
export async function getPullRequestThread(
  context: AzdoContext,
  repo: string,
  cred: AuthCredential,
  prId: number,
  threadId: number,
): Promise<ActiveCommentThread> {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}/_apis/git/repositories/${encodeURIComponent(repo)}/pullRequests/${prId}/threads/${threadId}`,
  );
  url.searchParams.set('api-version', '7.1');

  const response = await fetchWithErrors(url.toString(), { headers: authHeaders(cred) });
  const data = await readJsonResponse<AzdoThread>(response);
  return toActiveCommentThread(data);
}

// Creates a brand-new comment thread on the pull request overview. Neither
// `azdo pr comments reply` nor the Azure DevOps `az repos pr` extension can do
// this — they only append to an existing thread — so this is the transport for
// `azdo pr comments add`. Passing no status creates a plain, non-resolvable
// comment, exactly like typing into the Overview tab.
export async function createPullRequestThread(
  context: AzdoContext,
  repo: string,
  cred: AuthCredential,
  prId: number,
  content: string,
  status?: CreatableThreadStatus,
): Promise<ActiveCommentThread> {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}/_apis/git/repositories/${encodeURIComponent(repo)}/pullRequests/${prId}/threads`,
  );
  url.searchParams.set('api-version', '7.1');

  const payload: PullRequestThreadCreateRequest = {
    comments: [{ parentCommentId: 0, content, commentType: 1 }],
  };
  if (status !== undefined) {
    payload.status = status;
  }

  const response = await fetchWithErrors(url.toString(), {
    method: 'POST',
    headers: {
      ...authHeaders(cred),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await readJsonResponse<AzdoThread>(response);
  return toActiveCommentThread(data);
}

function buildThreadCommentUrl(context: AzdoContext, repo: string, prId: number, threadId: number): URL {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}/_apis/git/repositories/${encodeURIComponent(repo)}/pullRequests/${prId}/threads/${threadId}/comments`,
  );
  url.searchParams.set('api-version', '7.1');
  return url;
}

// Rewrites the body of an existing comment in place, keeping the thread, its
// id and its position in the discussion. Azure DevOps only lets a comment's
// own author edit it: any other identity gets a 401/403, which fetchWithErrors
// maps to AUTH_FAILED / PERMISSION_DENIED.
export async function updateThreadComment(
  context: AzdoContext,
  repo: string,
  cred: AuthCredential,
  prId: number,
  threadId: number,
  commentId: number,
  content: string,
): Promise<PostedPrComment> {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}/_apis/git/repositories/${encodeURIComponent(repo)}/pullRequests/${prId}/threads/${threadId}/comments/${commentId}`,
  );
  url.searchParams.set('api-version', '7.1');

  const response = await fetchWithErrors(url.toString(), {
    method: 'PATCH',
    headers: {
      ...authHeaders(cred),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });
  const data = await readJsonResponse<AzdoCreatedComment>(response);
  return {
    id: data.id,
    author: data.author?.displayName ?? null,
    content: data.content ?? content,
    publishedAt: data.publishedDate ?? null,
  };
}

export async function postThreadComment(
  context: AzdoContext,
  repo: string,
  cred: AuthCredential,
  prId: number,
  threadId: number,
  content: string,
): Promise<PostedPrComment> {
  const response = await fetchWithErrors(buildThreadCommentUrl(context, repo, prId, threadId).toString(), {
    method: 'POST',
    headers: {
      ...authHeaders(cred),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content, parentCommentId: 0, commentType: 1 }),
  });
  const data = await readJsonResponse<AzdoCreatedComment>(response);
  return {
    id: data.id,
    author: data.author?.displayName ?? null,
    content: data.content ?? content,
    publishedAt: data.publishedDate ?? null,
  };
}
