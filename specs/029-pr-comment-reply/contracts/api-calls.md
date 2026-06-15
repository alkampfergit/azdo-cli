# Azure DevOps API contracts — 029-pr-comment-reply

All calls authenticated with the existing `authHeaders(cred)` Basic-auth helper in `src/services/azdo-client.ts`. All calls go through `fetchWithErrors` so auth/permission/network errors map to the repo's standard `AzdoError` codes.

Base URL: `https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repo}/`  
API version param: `api-version=7.1`.

---

## `POST /pullRequests/{prId}/threads/{threadId}/comments` — post comment (new)

```
POST /pullRequests/{prId}/threads/{threadId}/comments?api-version=7.1
Content-Type: application/json
Authorization: Basic <pat-b64>

{
  "content": "<reply text>",
  "parentCommentId": 0,
  "commentType": 1
}
```

- `parentCommentId: 0` — new top-level comment in the thread (not nested)
- `commentType: 1` — text comment (enum value for `"text"`)
- `content` — the reply text verbatim; up to 150,000 characters (ADO limit)

### Response (200)

```json
{
  "id": 3,
  "parentCommentId": 0,
  "author": {
    "displayName": "Gian Maria",
    "id": "..."
  },
  "content": "Great suggestion!",
  "publishedDate": "2026-06-15T13:00:00.000Z",
  "lastUpdatedDate": "2026-06-15T13:00:00.000Z",
  "commentType": "text"
}
```

Only `id`, `author.displayName`, `content`, and `publishedDate` are read by the CLI. All other fields are ignored.

### Error mapping

| HTTP | AzdoError code | CLI stderr message |
|------|----------------|--------------------|
| 401 | `AUTH_FAILED` | "Authentication failed; run `azdo auth login`." |
| 403 | `PERMISSION_DENIED` | "Permission denied posting to thread #\<id\>." |
| 404 | `NOT_FOUND` | "Thread #\<id\> not found on pull request #\<pr\>." |
| 5xx | `HTTP_<code>` | "Azure DevOps returned \<code\>; retry later." |
| network | `NETWORK_ERROR` | "Network error contacting Azure DevOps." |

### New service helper

```typescript
export async function postThreadComment(
  context: AzdoContext,
  repo: string,
  cred: AuthCredential,
  prId: number,
  threadId: number,
  content: string,
): Promise<PostedPrComment>
```

Located in `src/services/pr-client.ts`. Constructs the URL, sends the POST, reads the 200 response body via `readJsonResponse<AzdoCreatedComment>`, and maps it to `PostedPrComment`.

### URL construction

```typescript
function buildThreadCommentUrl(context: AzdoContext, repo: string, prId: number, threadId: number): URL {
  return new URL(
    `https://dev.azure.com/${encodeURIComponent(context.org)}/${encodeURIComponent(context.project)}` +
    `/_apis/git/repositories/${encodeURIComponent(repo)}` +
    `/pullRequests/${prId}/threads/${threadId}/comments?api-version=7.1`
  );
}
```

---

## Existing API calls reused without modification

| Endpoint | Used for |
|----------|---------|
| `GET /pullRequests?sourceRefName=...` | Branch-based PR lookup (via `listPullRequests`) |
| `GET /pullRequests/{prId}` | Explicit `--pr-number` lookup (via `getPullRequestById`) |
