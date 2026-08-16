# Azure DevOps API contracts — 033-pr-comment-authoring

All calls use `api-version=7.1` and the existing `authHeaders()` / `fetchWithErrors()` pair, which
maps 401 → `AUTH_FAILED`, 403 → `PERMISSION_DENIED`, 404 → `NOT_FOUND`, network failure →
`NETWORK_ERROR`, and any other non-2xx → `HTTP_<status>`.

Base: `https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repo}`

---

## `POST /pullRequests/{prId}/threads` — create a comment thread (new)

Service helper: `createPullRequestThread(context, repo, cred, prId, content, status?)`
→ `Promise<ActiveCommentThread>`

### Request

```json
{
  "comments": [{ "parentCommentId": 0, "content": "<body>", "commentType": 1 }],
  "status": "active"
}
```

`status` is present only when the caller passed `--status`. `commentType: 1` is the numeric enum for
a human ("text") comment; `parentCommentId: 0` makes the comment the thread root. No `threadContext`
is sent, which is what makes the thread a general overview comment rather than a code-anchored one.

### Response (200)

A thread object; mapped through the existing `toActiveCommentThread()`. The command reads `id`
(new thread) and `comments[0].id` (new comment).

### Scope

`Code (Read & Write)` — errors are reported with the write-scope hint.

---

## `PATCH /pullRequests/{prId}/threads/{threadId}/comments/{commentId}` — edit a comment (new)

Service helper: `updateThreadComment(context, repo, cred, prId, threadId, commentId, content)`
→ `Promise<PostedPrComment>`

### Request

```json
{ "content": "<new body>" }
```

### Response (200)

The updated comment; mapped to `PostedPrComment` (`id`, `author`, `content`, `publishedAt`).

### Notes

Azure DevOps allows only the comment's author to edit it. Another identity gets 401/403, surfaced as
`Authentication failed …` / `Access denied …` with the `Code (Read & Write)` hint — the CLI does not
attempt to detect this client-side.

---

## `GET /pullRequests/{prId}/threads/{threadId}` — read one thread (new)

Service helper: `getPullRequestThread(context, repo, cred, prId, threadId)`
→ `Promise<ActiveCommentThread>`

Used by `pr comments edit` to resolve the target comment id and its previous body. Cheaper than the
existing list call and, unlike `getPullRequestThreads()`, it never drops the thread when comment-level
filtering empties it. A 404 becomes `Thread #<id> not found on pull request #<pr>.`

---

## `GET /pullrequests` — list pull requests (generalised)

Service helper: `listRepositoryPullRequests(context, repo, cred, { sourceBranch?, status?, top? })`
→ `Promise<BranchPullRequestMatch[]>`

### Query parameters

| Parameter | Sent when |
|-----------|-----------|
| `searchCriteria.sourceRefName=refs/heads/<branch>` | `--branch` given — otherwise omitted entirely, returning the whole repository |
| `searchCriteria.status=<active\|completed\|abandoned\|all>` | always (`active` by default) |
| `$top=<n>` | always (25 by default) |
| `api-version=7.1` | always |

`buildPullRequestsUrl()` now takes `string | null` for the source branch and an optional `top`;
`listPullRequests()` (branch-scoped, used by `pr status` / auto-detection) is unchanged in behaviour
and delegates to the same builder.

### Response (200)

`{ count, value: AzdoPullRequest[] }`, each mapped by `mapPullRequest()` — which now also carries
`description` (trimmed, `null` when absent).

### Scope

`Code (Read)`.

---

## Existing calls reused without modification

- `GET /pullRequests/{prId}` — `getPullRequestById()` for `--pr-number`.
- `GET /pullRequests/{prId}/threads` — `getPullRequestThreads()` for `pr comments`; its mapping now
  also returns `commentType` per comment.
- `POST /pullRequests/{prId}/threads/{threadId}/comments` — `postThreadComment()` for `reply`.
- `PATCH /pullRequests/{prId}/threads/{threadId}` — `patchThreadStatus()` for resolve / reopen.
