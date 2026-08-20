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

## Follow-up round: consumer feedback (2026-08-20)

### `BranchPullRequestMatch` — author identity (modified)

```ts
createdByUniqueName?: string | null;   // account, usually an email — the comparable value
createdById?: string | null;           // Azure DevOps identity GUID
```

Additive and optional so existing fixtures stay valid; `mapPullRequest()` always sets both (null
when Azure DevOps omits them). `createdBy` keeps its display-name meaning. `AzdoPullRequest.createdBy`
gains the matching raw fields `uniqueName` / `id`.

`url` is unchanged in **type** but not in **behaviour**: it is now always a string, built as
`https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}` when `_links.web` is absent.

### `ActivePullRequestComment` — truncation metadata (modified)

```ts
truncated?: boolean;        // whether --max-chars cut this body
originalLength?: number;    // length before truncation
```

Set by the `pr comments` output layer (not by the client mapping), and always emitted by that
command so a consumer never infers truncation from the ` […]` marker.

### `TruncatedContent` (new, `src/commands/pr.ts` — local)

```ts
interface TruncatedContent {
  content: string;
  truncated: boolean;
  originalLength: number;
}
```

Return type of `truncateContent()`, spread over the comment being emitted.

### `AuthIdentity` (new, `src/types/auth-diagnostics.ts`)

```ts
export interface AuthIdentity {
  displayName: string | null;
  uniqueName: string | null;   // account, the comparable value
  id: string | null;           // Azure DevOps identity GUID
}
```

### `AuthDiagnosticReport` — identity (modified)

```ts
identity: AuthIdentity | null;
```

Null when there is no credential, when connectivity already failed (the lookup is skipped), or when
the lookup itself failed. The formatter tests truthiness rather than `!== null`, so a report built
before this field existed cannot crash it.

### `AzdoConnectionData` (new, `src/types/auth-diagnostics.ts`)

Minimal shape of `GET /_apis/connectionData`: `authenticatedUser.{ id, providerDisplayName,
properties.Account.$value }`.

### Exit codes (`src/commands/pr.ts` — local constants)

```ts
const EXIT_NOT_FOUND = 3;      // addressed pull request / thread / comment is missing
const EXIT_NOT_PERMITTED = 4;  // AUTH_FAILED or PERMISSION_DENIED
```

`writeError(message, exitCode = 1)` carries the code; `1` stays the default for validation and other
failures.

## Existing types reused unchanged

- `ActiveCommentThread` — returned by `createPullRequestThread()` and `getPullRequestThread()`.
- `PostedPrComment` — returned by `updateThreadComment()`, same shape as a posted reply.
- `PullRequestCommentsResult`, `PullRequestStatusResult`, `PullRequestCheck`, `CodeCommentCounts`.
