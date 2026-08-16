# Data Model: PR Comment Authoring & Pull Request Lookup

**Feature**: `033-pr-comment-authoring`

## New types (`src/types/pull-request.ts`)

### `CreatableThreadStatus`

```ts
export type CreatableThreadStatus = 'active' | 'fixed' | 'wontFix' | 'closed' | 'byDesign' | 'pending';
```

The thread statuses accepted by `pr comments add --status`. Deliberately a separate union from
`AzdoThreadStatus`, which includes `unknown` — a value the CLI reads back but must never send.

### `PullRequestThreadCreateRequest`

```ts
export interface PullRequestThreadCreateRequest {
  comments: Array<{ parentCommentId: number; content: string; commentType: number }>;
  status?: CreatableThreadStatus;
}
```

Body of `POST .../threads`. `status` is optional by design: omitting the key produces a plain,
non-resolvable overview comment, which is not expressible by any status value.

## Modified types

### `BranchPullRequestMatch` — `description?: string | null`

The PR overview description, trimmed, `null` when Azure DevOps returns none or only whitespace.
Optional on the interface so existing fixtures stay valid; `mapPullRequest()` always sets it.
Surfaces in `pr list --json`, `pr comments --json`, and `pr status --json` (which embeds the same object).

### `ActivePullRequestComment` — `commentType?: string | null`

`text` for human comments, `system` for Azure DevOps-generated entries. Read by the
`--exclude-system` filter; `null` when the API omits it.

### `AzdoPullRequest` — `description?: string`, `AzdoComment` — `commentType?: string`

The raw API fields backing the two above.

## Command-local result shapes (`src/commands/pr.ts`, not exported)

### `PrCommentAddResult`

```ts
{
  pullRequestId: number;
  threadId: number | null;    // null on --dry-run: nothing was created
  commentId: number | null;   // null on --dry-run
  status: string | null;      // requested status on a dry run, server status otherwise
  content: string;
  dryRun: boolean;
}
```

### `PrCommentEditResult`

```ts
{
  pullRequestId: number;
  threadId: number;
  commentId: number;
  previousContent: string;    // what was replaced — lets a caller diff or roll back
  content: string;
  dryRun: boolean;
}
```

### `PrListResult`

```ts
{
  repository: string;
  branch: string | null;      // the --branch filter, refs/heads/ stripped; null when unfiltered
  status: string;             // the applied status filter
  pullRequests: BranchPullRequestMatch[];
}
```

## Resolver types

`ResolvedThreadTarget` now extends a new `ResolvedPullRequestTarget` (`context`, `repo`, `pat`,
`pullRequest`). `pr comments add` needs the PR but no thread, so PR resolution was split out of
`resolveThreadTarget()`; both keep the same validation order and the same 023/029 error strings.

## Existing types reused unchanged

- `ActiveCommentThread` — returned by `createPullRequestThread()` and `getPullRequestThread()`.
- `PostedPrComment` — returned by `updateThreadComment()`, same shape as a posted reply.
- `PullRequestCommentsResult`, `PullRequestStatusResult`, `PullRequestCheck`, `CodeCommentCounts`.
