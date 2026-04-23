import type { AzdoContext } from '../types/work-item.js';
import { authHeaders, fetchWithErrors } from './azdo-client.js';
import type {
  ActiveCommentThread,
  ActivePullRequestComment,
  AzdoPrListResponse,
  AzdoPrStatusListResponse,
  AzdoPullRequest,
  AzdoPullRequestStatus,
  AzdoThread,
  AzdoThreadListResponse,
  BranchPullRequestMatch,
  PullRequestCheck,
  PullRequestOpenRequest,
  PullRequestOpenResult,
} from '../types/pull-request.js';

function buildPullRequestsUrl(
  context: AzdoContext,
  repo: string,
  sourceBranch: string,
  opts?: { status?: string; targetBranch?: string },
): URL {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}/_apis/git/repositories/${encodeURIComponent(repo)}/pullrequests`,
  );
  url.searchParams.set('api-version', '7.1');
  url.searchParams.set('searchCriteria.sourceRefName', `refs/heads/${sourceBranch}`);

  if (opts?.status) {
    url.searchParams.set('searchCriteria.status', opts.status);
  }

  if (opts?.targetBranch) {
    url.searchParams.set('searchCriteria.targetRefName', `refs/heads/${opts.targetBranch}`);
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

function mapPullRequest(repo: string, pullRequest: AzdoPullRequest): BranchPullRequestMatch {
  return {
    id: pullRequest.pullRequestId,
    title: pullRequest.title,
    repository: repo,
    sourceRefName: pullRequest.sourceRefName,
    targetRefName: pullRequest.targetRefName,
    status: pullRequest.status,
    createdBy: pullRequest.createdBy?.displayName ?? null,
    url: pullRequest._links?.web?.href ?? null,
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

  return {
    id: thread.id,
    status: thread.status,
    threadContext: thread.threadContext?.filePath ?? null,
    comments,
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

// Fetches a single pull request by its numeric id. Used by the
// --pr-number flag on `azdo pr comments` (and related subcommands) so the
// command can target any PR without going through the current-branch
// resolution path. fetchWithErrors maps a 404 response to a NOT_FOUND
// error; callers translate that into a user-facing "PR not found"
// message.
export async function getPullRequestById(
  context: AzdoContext,
  repo: string,
  pat: string,
  prId: number,
): Promise<BranchPullRequestMatch> {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}/_apis/git/repositories/${encodeURIComponent(repo)}/pullRequests/${prId}`,
  );
  url.searchParams.set('api-version', '7.1');

  const response = await fetchWithErrors(url.toString(), { headers: authHeaders(pat) });
  const data = await readJsonResponse<AzdoPullRequest>(response);
  return mapPullRequest(repo, data);
}

export async function listPullRequests(
  context: AzdoContext,
  repo: string,
  pat: string,
  sourceBranch: string,
  opts?: { status?: string; targetBranch?: string },
): Promise<BranchPullRequestMatch[]> {
  const response = await fetchWithErrors(
    buildPullRequestsUrl(context, repo, sourceBranch, opts).toString(),
    { headers: authHeaders(pat) },
  );
  const data = await readJsonResponse<AzdoPrListResponse>(response);
  return data.value.map((pullRequest) => mapPullRequest(repo, pullRequest));
}

export async function getPullRequestChecks(
  context: AzdoContext,
  repo: string,
  pat: string,
  prId: number,
): Promise<PullRequestCheck[]> {
  const response = await fetchWithErrors(
    buildPullRequestStatusesUrl(context, repo, prId).toString(),
    { headers: authHeaders(pat) },
  );
  const data = await readJsonResponse<AzdoPrStatusListResponse>(response);

  return data.value
    .map(mapPullRequestCheck)
    .filter((check): check is PullRequestCheck => check !== null);
}

export async function openPullRequest(
  context: AzdoContext,
  repo: string,
  pat: string,
  sourceBranch: string,
  title: string,
  description: string,
): Promise<PullRequestOpenResult> {
  const existing = await listPullRequests(context, repo, pat, sourceBranch, {
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
      ...authHeaders(pat),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await readJsonResponse<AzdoPullRequest>(response);
  return {
    branch: sourceBranch,
    targetBranch: 'develop',
    created: true,
    pullRequest: mapPullRequest(repo, data),
  };
}

export async function getPullRequestThreads(
  context: AzdoContext,
  repo: string,
  pat: string,
  prId: number,
): Promise<ActiveCommentThread[]> {
  const url = new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}/_apis/git/repositories/${encodeURIComponent(repo)}/pullRequests/${prId}/threads`,
  );
  url.searchParams.set('api-version', '7.1');

  const response = await fetchWithErrors(url.toString(), { headers: authHeaders(pat) });
  const data = await readJsonResponse<AzdoThreadListResponse>(response);

  return data.value
    .map(mapThread)
    .filter((thread): thread is ActiveCommentThread => thread !== null);
}
