# Research: PR Comment Reply

**Date**: 2026-06-15  
**Source**: Microsoft Learn MCP server (api-version 7.1)

## 1. ADO REST API — POST thread comment

**Decision**: Use `POST /pullRequests/{prId}/threads/{threadId}/comments?api-version=7.1`

**Endpoint**:
```
POST https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repo}/pullRequests/{prId}/threads/{threadId}/comments?api-version=7.1
Content-Type: application/json
Authorization: Basic <pat-b64>

{
  "content": "<reply text>",
  "parentCommentId": 0,
  "commentType": 1
}
```

- `parentCommentId: 0` — adds a new top-level comment to the thread (not nested under an existing comment). This matches the user's intent of "replying to a thread".
- `commentType: 1` — `text` (regular user comment). Using `unknown` (0) would work but `text` is semantically correct.
- `content` — up to 150,000 characters per ADO documentation.

**Response (200)**:
```json
{
  "id": 2,
  "parentCommentId": 1,
  "author": { "displayName": "...", "id": "..." },
  "content": "Good idea",
  "publishedDate": "2016-11-01T16:30:51.383Z",
  "lastUpdatedDate": "2016-11-01T16:30:51.383Z",
  "commentType": "text"
}
```

**Rationale**: This is the only ADO REST endpoint for adding a comment to an existing thread. The distinction between "create thread" (`POST /threads`) and "add comment to thread" (`POST /threads/{id}/comments`) is important — the feature requests the latter.

**Alternatives considered**: `POST /threads` would create a NEW top-level thread; this is explicitly out of scope.

## 2. Command structure — canonical vs alias

**Decision**: `azdo pr comments reply` is canonical; `azdo pr comment-reply` is an alias (commander.js `.alias()`).

**Rationale**: Owner explicitly chose `comments reply` as primary (issue #65 clarification Q1-A). The alias `comment-reply` preserves consistency with existing `comment-resolve` / `comment-reopen` commands for users who prefer the flat pattern.

**Implementation**: Two `Command` factory functions — `createPrCommentsReplyCommand()` returns the `reply` subcommand (registered under `comments`), and `createPrCommentReplyCommand()` returns the top-level `comment-reply` command. Both delegate to a shared `runCommentReply()` function.

**Alternatives considered**: Single `Command` with `.alias()` at the `pr` level — rejected because commander.js command aliases work at the parent level, not across hierarchy levels. Separate factories sharing the same action body is the correct pattern.

## 3. PR resolution — branch-based vs explicit

**Decision**: Reuse existing `resolveThreadTarget()` from the `comment-resolve` / `comment-reopen` path.

**Rationale**: The PR resolution logic (branch lookup vs `--pr-number`) is already well-tested and handles all edge cases. Extracting it once (already done) avoids duplication (Constitution III).

**Note on PR state**: No pre-validation of PR state (per clarification Q2 default). The API call proceeds regardless; a server-side `403` or `404` surfaces as a clear error.

## 4. Output shape — `PostedPrComment`

**Decision**: New exported interface in `pull-request.ts` that maps from the ADO response.

Fields kept:
- `id` — the new comment's ID (used in `--json` output as `commentId`)
- `author` — `string | null` (displayName), consistent with `ActivePullRequestComment`
- `content` — the posted text (echoed back for confirmation)
- `publishedAt` — ISO date string or null

**Rationale**: Mirrors `ActivePullRequestComment` shape for consistency. The `--json` output uses a flat `PrCommentReplyResult` that also carries `pullRequestId` and `threadId` (from the call context, not the response body).

## 5. Error mapping

The existing `fetchWithErrors` + `handlePrCommandError` pattern covers:

| HTTP | User message |
|------|-------------|
| 401 | AUTH_FAILED → "Authentication failed; run `azdo auth login`." |
| 403 | PERMISSION_DENIED → "Permission denied posting to thread #\<id\>." |
| 404 | NOT_FOUND → "Thread #\<id\> not found on pull request #\<pr\>." |
| 5xx | HTTP_\<code\> → "Azure DevOps returned \<code\>; retry later." |
| network | NETWORK_ERROR → "Network error contacting Azure DevOps." |

No new error-handling infrastructure required.
