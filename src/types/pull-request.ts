export interface BranchPullRequestMatch {
  id: number;
  title: string;
  repository: string;
  sourceRefName: string;
  targetRefName: string;
  status: string;
  createdBy: string | null;
  url: string;
}

export interface PullRequestStatusResult {
  branch: string;
  repository: string;
  pullRequests: BranchPullRequestMatch[];
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

export interface ActiveCommentThread {
  id: number;
  status: string;
  threadContext: string | null;
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
  _links: {
    web: {
      href: string;
    };
  };
}

export interface AzdoThreadListResponse {
  value: AzdoThread[];
}

export interface AzdoThread {
  id: number;
  status: string;
  threadContext?: {
    filePath?: string;
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
