# Data Model: Pull Request Handling

**Date**: 2026-03-27
**Feature**: 008-pull-request-handling

## TypeScript Types (src/types/pull-request.ts)

### BranchPullRequestMatch

One pull request returned by a branch lookup.

```typescript
interface BranchPullRequestMatch {
  id: number;
  title: string;
  repository: string;
  sourceRefName: string;   // e.g. "refs/heads/feature-x"
  targetRefName: string;   // e.g. "refs/heads/develop"
  status: string;          // "active" | "completed" | "abandoned" | ...
  createdBy: string | null;
  url: string;             // web link to the PR
}
```

Validation rules:
- `sourceRefName` must correspond to the current branch for create/comments flows.
- `status` is preserved from Azure DevOps to keep non-active matches visible in `pr status` output.

---

### PullRequestStatusResult

Return type for `pr status`.

```typescript
interface PullRequestStatusResult {
  branch: string;
  repository: string;
  pullRequests: BranchPullRequestMatch[];
}
```

Rules:
- An empty `pullRequests` array is a valid success result (FR-004).
- Results may contain entries with any status (active, completed, abandoned).

---

### PullRequestOpenRequest

Input collected by `pr open`.

```typescript
interface PullRequestOpenRequest {
  sourceRefName: string;   // formatted by pr-client.ts from branch name
  targetRefName: string;   // formatted by pr-client.ts from "develop"
  title: string;           // required --title flag value
  description: string;     // required --description flag value
}
```

Rules:
- Both `title` and `description` are required CLI flags per clarification 2026-03-27.
- Command fails with actionable error if either is missing (FR-005a).
- `sourceRefName` must not be `refs/heads/develop` (FR-009).

---

### PullRequestOpenResult

Return type for `pr open`.

```typescript
interface PullRequestOpenResult {
  branch: string;
  targetBranch: string;    // "develop"
  created: boolean;        // true = new PR created; false = existing PR reused
  pullRequest: BranchPullRequestMatch;
}
```

Rules:
- `pullRequest.status` must be `active` for both created and reused outcomes.
- `created: false` when one active source-target match already existed (FR-008).
- Command fails when multiple active matches exist (ambiguity error).

---

### ActiveCommentThread

One unresolved thread from `pr comments`.

```typescript
interface ActiveCommentThread {
  id: number;
  status: string;                  // "active" | "pending"
  threadContext: string | null;    // file path or summary text; null for general comments
  comments: ActivePullRequestComment[];
}
```

Rules:
- Only threads with `status === 'active'` or `status === 'pending'` are included.
- Threads with zero visible comments after filtering are excluded entirely.

---

### ActivePullRequestComment

One visible comment inside an active thread.

```typescript
interface ActivePullRequestComment {
  id: number;
  author: string | null;
  content: string;
  publishedAt: string | null;   // ISO 8601 string from API
}
```

Rules:
- Deleted comments (`isDeleted === true`) are excluded.
- Empty or whitespace-only content is excluded.

---

### PullRequestCommentsResult

Return type for `pr comments`.

```typescript
interface PullRequestCommentsResult {
  branch: string;
  pullRequest: BranchPullRequestMatch;
  threads: ActiveCommentThread[];
}
```

Rules:
- An empty `threads` array is a valid success result when the PR has no active comments (FR-013).
- Command fails when no active PR exists or when multiple active PRs make selection ambiguous (FR-014).

---

## Azure DevOps API Response Interfaces (pr-client.ts internal)

These are internal types used only for parsing API responses — not exported.

```typescript
interface AzdoPrListResponse {
  value: AzdoPullRequest[];
  count: number;
}

interface AzdoPullRequest {
  pullRequestId: number;
  title: string;
  status: string;
  sourceRefName: string;
  targetRefName: string;
  createdBy?: { displayName?: string };
  _links: { web: { href: string } };
}

interface AzdoThreadListResponse {
  value: AzdoThread[];
}

interface AzdoThread {
  id: number;
  status: string;
  threadContext?: { filePath?: string };
  comments: AzdoComment[];
}

interface AzdoComment {
  id: number;
  author?: { displayName?: string };
  content?: string;
  isDeleted?: boolean;
}
```

---

## Relationships

- One local branch → zero or many `BranchPullRequestMatch` records (`pr status`).
- One `PullRequestOpenResult` contains exactly one active `BranchPullRequestMatch`.
- One `PullRequestCommentsResult` contains exactly one resolved active `BranchPullRequestMatch` and zero or more `ActiveCommentThread` entries.
- One `ActiveCommentThread` contains one or more `ActivePullRequestComment` entries after filtering.

## State Transitions

### `pr status`
1. context-resolved → pull-requests-queried → results-returned

### `pr open`
1. context-resolved → active-prs-queried →
   - `reused-existing` (one active match found)
   - `failed-ambiguous` (multiple active matches)
   - `created-new` (no active match → create succeeds)

### `pr comments`
1. context-resolved → branch-active-prs-queried → relevant-pr-resolved →
   threads-queried → threads-filtered → results-returned
