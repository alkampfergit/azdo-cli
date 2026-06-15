# Data Model: PR Comment Reply

**Date**: 2026-06-15

## New types

### `PostedPrComment` (new, `src/types/pull-request.ts`)

Maps the ADO `POST /threads/{threadId}/comments` response to the CLI's type system.

```typescript
export interface PostedPrComment {
  id: number;           // The new comment's ID within the thread
  author: string | null; // displayName of the commenter (null if backend omits it)
  content: string;       // The text that was posted
  publishedAt: string | null; // ISO-8601 date from publishedDate, null if absent
}
```

**Rationale**: Mirrors `ActivePullRequestComment` (same field names, same nullability rules) for consistency. `id` is load-bearing for the `--json` output `commentId` field.

### `PrCommentReplyResult` (new, `src/commands/pr.ts` — local, not exported)

The shape emitted on `--json`:

```typescript
interface PrCommentReplyResult {
  pullRequestId: number;
  threadId: number;
  commentId: number;
  content: string;
}
```

**Rationale**: Flat shape consistent with `ThreadStateChangeResult`. Carries the contextual IDs (`pullRequestId`, `threadId`) that are not in the API response body.

## Existing types reused without modification

| Type | File | Used for |
|------|------|---------|
| `AzdoContext` | `src/types/work-item.ts` | org/project/repo context |
| `AuthCredential` | `src/types/work-item.ts` | PAT / OAuth token |
| `BranchPullRequestMatch` | `src/types/pull-request.ts` | resolved PR from branch/id lookup |
| `ResolvedThreadTarget` | `src/commands/pr.ts` | reused resolver result |
| `PrCommandOptions` | `src/commands/pr.ts` | `--org`, `--project`, `--pr-number`, `--json` |

## New raw ADO response type

### `AzdoCreatedComment` (new, `src/types/pull-request.ts`)

Minimal shape for the `POST /comments` 200 response — only the fields the CLI reads:

```typescript
export interface AzdoCreatedComment {
  id: number;
  author?: { displayName?: string };
  content?: string;
  publishedDate?: string;
}
```

**Rationale**: ADO returns many more fields; only these are needed to build `PostedPrComment`. Mirrors `AzdoComment` (the existing GET response type) to stay consistent.
