# Phase 1 Data Model — 017-pr-comments-threads

Types and state machines that back the feature. All types live in TypeScript
under `src/` and (after this feature) represent Azure DevOps PR threads and
comments as they actually come back from the REST API.

## Entities

### `AzdoPullRequest` (relaxed)

Raw response shape from Azure DevOps PR list / by-id. Fields used by this
feature:

| Field | Type | Notes |
| --- | --- | --- |
| `pullRequestId` | `number` | Positive integer. Stable PR id. |
| `title` | `string` | Non-empty in practice. |
| `sourceRefName` | `string` | e.g. `refs/heads/feature/x`. |
| `targetRefName` | `string` | e.g. `refs/heads/develop`. |
| `status` | `"active" \| "completed" \| "abandoned" \| string` | backend-driven. |
| `createdBy` | `{ displayName?: string } \| undefined` | optional. |
| `_links` | `{ web?: { href?: string } } \| undefined` | **RELAXED**: was required before the fix; now optional everywhere. |

### `BranchPullRequestMatch` (mapped)

Returned by `mapPullRequest`. The only breaking change is `url`:

| Field | Before | After | Note |
| --- | --- | --- | --- |
| `url` | `string` | `string \| null` | null when `_links.web.href` is missing; printed as `—`. |

All other fields unchanged.

### `AzdoThreadStatus`

Union type matching the backend's `CommentThreadStatus` enum:

```ts
type AzdoThreadStatus =
  | "unknown"
  | "active"
  | "fixed"
  | "wontFix"
  | "closed"
  | "byDesign"
  | "pending";
```

### `ActiveCommentThread` (renamed intent, not type name)

Extended to carry the full status set plus a derived "settled" flag. The
*name* stays `ActiveCommentThread` to avoid a gratuitous rename; its
semantics widen.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `number` | Stable thread id within the PR. |
| `status` | `AzdoThreadStatus` | Was `"active" \| "pending"`; now full enum. |
| `threadContext` | `string \| null` | File path for inline threads; null for overview threads. |
| `comments` | `ActivePullRequestComment[]` | Non-deleted comments only; may be empty for purely metadata threads (see "Filter rules"). |

### `ActivePullRequestComment`

Unchanged. Non-deleted comments that have non-empty trimmed `content`.

## Derived values used in rendering

- `isThreadResolved(status)` → `boolean`
  `true` when `status` is one of `fixed`, `wontFix`, `closed`, `byDesign`.
  Drives:
  - `--hide-resolved` filter on `pr comments`.
  - "already in desired state" short-circuit in
    `pr comment-resolve` / `pr comment-reopen`.

- `statusIndicator(status)` → `string` — short bracketed tag rendered
  before each thread title (e.g. `[active]`, `[resolved]`, `[pending]`,
  `[won't fix]`). `resolved` is the user-facing label for every backend
  status where `isThreadResolved` is true, unless the backend status is
  one of the more specific settled states, in which case the specific
  label shows.

## State transitions — thread status

Transitions driven by the two new CLI commands:

```
pr comment-resolve <threadId>
  current === "active" || "pending" → PATCH { status: "fixed" }
                                      → exit 0, "thread #<id> resolved"
  current is any settled state       → no PATCH
                                      → exit 0, "thread #<id> already in resolved state"

pr comment-reopen <threadId>
  current is any settled state       → PATCH { status: "active" }
                                      → exit 0, "thread #<id> reopened"
  current === "active" || "pending"  → no PATCH
                                      → exit 0, "thread #<id> already active"
```

## Filter rules — `pr comments`

Applied in order before rendering:

1. Drop threads whose `comments` array (after removing deleted + empty
   comments) is empty. This preserves the existing "metadata thread"
   suppression.
2. If `--hide-resolved` is set, drop threads where
   `isThreadResolved(status) === true`.
3. Sort by existing order (backend default — most-recent-update first).

## Validation rules — `--pr-number <N>`

- Parse as base-10 integer via `Number.parseInt(raw, 10)`.
- Reject if the raw string does not match `/^\d+$/` (rejects leading
  signs, whitespace-only, floats).
- Reject if the parsed number is `< 1` or not finite.
- On reject: print a commander-style validation error to stderr and
  return with `process.exitCode = 1`. No crash, no 5xx-style noise.
- A well-formed PR number that doesn't exist in the backend returns 404
  from the GET-by-id helper; the command maps that to `"Pull request #<N> not found in <org>/<project>/<repo>."` and exits non-zero.

## Validation rules — thread id

- Same parsing rule as `--pr-number`.
- A well-formed but non-existent thread id returns 404 from the GET
  thread-by-id call (re-used from the full threads list — we match by
  `id` in the already-fetched list to avoid an extra round-trip). If the
  thread id is not found in the PR's thread list, exit non-zero with
  `"Thread #<id> not found on pull request #<pr>."`.
