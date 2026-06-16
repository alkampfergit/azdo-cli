export interface BranchPullRequestMatch {
  id: number;
  title: string;
  repository: string;
  sourceRefName: string;
  targetRefName: string;
  status: string;
  createdBy: string | null;
  url: string | null;
}

export interface PullRequestCheck {
  id: number;
  state: string;
  name: string;
  description: string | null;
  targetUrl: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  // Where this check came from: the Pull Request Status API (`status`), a
  // branch policy evaluation (`policy`), or the Builds API (`build`).
  // Branch-policy build validations are the green checks the Azure DevOps UI
  // shows; they are NOT returned by the statuses endpoint, so all three sources
  // are merged for `pr status`.
  source?: 'status' | 'policy' | 'build';
  // Whether this check is a blocking (required) policy. True = required,
  // false = optional, null/undefined = unknown (status and build sources).
  isBlocking?: boolean | null;
}

// Open/closed counts of code-anchored (file/line) comment threads on a PR.
// General (non-file-anchored) threads are excluded.
export interface CodeCommentCounts {
  open: number;
  closed: number;
}

export interface PullRequestStatusPullRequest extends BranchPullRequestMatch {
  checks: PullRequestCheck[];
  codeCommentCounts: CodeCommentCounts;
  // Set when check retrieval failed entirely (both the status and policy
  // sources errored), so "none reported" is never shown for a fetch failure.
  checksError?: string | null;
}

export interface PullRequestStatusResult {
  branch: string;
  repository: string;
  pullRequests: PullRequestStatusPullRequest[];
}

export interface PullRequestOpenRequest {
  sourceRefName: string;
  targetRefName: string;
  title: string;
  description: string;
}

export interface PullRequestOpenResult {
  branch: string;
  targetBranch: string;
  created: boolean;
  pullRequest: BranchPullRequestMatch;
}

export interface ActivePullRequestComment {
  id: number;
  author: string | null;
  content: string;
  publishedAt: string | null;
}

// Azure DevOps comment-thread status enum. The backend may return other
// strings in the future; we keep `string` as the compile-time type on the
// thread itself and use this union only where we reason about the enum.
export type AzdoThreadStatus =
  | 'unknown'
  | 'active'
  | 'fixed'
  | 'wontFix'
  | 'closed'
  | 'byDesign'
  | 'pending';

export interface ActiveCommentThread {
  id: number;
  status: string;
  threadContext: string | null;
  line: number | null;
  comments: ActivePullRequestComment[];
}

export interface PullRequestCommentsResult {
  branch: string;
  pullRequest: BranchPullRequestMatch;
  threads: ActiveCommentThread[];
}

export interface AzdoPrListResponse {
  value: AzdoPullRequest[];
  count: number;
}

export interface AzdoPullRequest {
  pullRequestId: number;
  title: string;
  status: string;
  sourceRefName: string;
  targetRefName: string;
  createdBy?: {
    displayName?: string;
  };
  _links?: {
    web?: {
      href?: string;
    };
  };
}

export interface AzdoThreadListResponse {
  value: AzdoThread[];
}

interface CommentPosition {
  line: number;
  offset: number;
}

export interface AzdoThread {
  id: number;
  status?: string;
  threadContext?: {
    filePath?: string;
    rightFileStart?: CommentPosition;
    rightFileEnd?: CommentPosition;
    leftFileStart?: CommentPosition;
    leftFileEnd?: CommentPosition;
  };
  comments: AzdoComment[];
}

export interface AzdoComment {
  id: number;
  author?: {
    displayName?: string;
  };
  content?: string;
  isDeleted?: boolean;
  publishedDate?: string;
}

export interface AzdoPrStatusListResponse {
  value: AzdoPullRequestStatus[];
  count: number;
}

export interface AzdoPullRequestStatus {
  id: number;
  state: string;
  description?: string | null;
  context?: {
    genre?: string;
    name?: string;
  };
  createdBy?: {
    displayName?: string;
  };
  creationDate?: string;
  updatedDate?: string;
  targetUrl?: string;
}

// Minimal shape of the POST /threads/{id}/comments 200 response. Only the
// fields the CLI reads are declared; the ADO API returns many more.
export interface AzdoCreatedComment {
  id: number;
  author?: { displayName?: string };
  content?: string;
  publishedDate?: string;
}

// Result of a successful postThreadComment() call — mapped from the ADO
// response and exposed to command code. Mirrors ActivePullRequestComment
// in nullability convention.
export interface PostedPrComment {
  id: number;
  author: string | null;
  content: string;
  publishedAt: string | null;
}

// Minimal shape of the Projects API response — we only need the GUID to build
// the policy-evaluation artifactId.
export interface AzdoProject {
  id: string;
  name?: string;
}

export interface AzdoPolicyEvaluationListResponse {
  value: AzdoPolicyEvaluation[];
  count?: number;
}

// Branch policy evaluation as returned by
// GET .../_apis/policy/evaluations?artifactId=...
// `status` ∈ {approved, rejected, running, queued, notApplicable, notSet, ...}.
export interface AzdoPolicyEvaluation {
  evaluationId?: string;
  status?: string;
  configuration?: {
    id?: number;
    isBlocking?: boolean;
    type?: {
      id?: string;
      displayName?: string;
    };
    settings?: {
      displayName?: string;
    };
  };
}
