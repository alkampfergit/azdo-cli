# Azure DevOps API contracts — 017-pr-comments-threads

All calls authenticated with the existing `authHeaders(pat)` Basic-auth
helper in `src/services/azdo-client.ts`. All calls go through
`fetchWithErrors` (existing) so auth/permission/network errors map to
the repo's standard `AzdoError` codes.

Base URL: `https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repo}/`
API version param: `api-version=7.1`.

## 1. `GET /pullRequests/{prId}` — PR by id (new)

Used when `--pr-number <N>` is passed to any of the three commands.

```
GET /pullRequests/{prId}?api-version=7.1
Accept: application/json
Authorization: Basic <pat-b64>
```

### Response (200)

Full `AzdoPullRequest` object. Only the fields used by the feature are
load-bearing (see [data-model.md](../data-model.md)); the rest are passed
through.

### Error mapping

| HTTP | Behaviour |
| --- | --- |
| 401 | `AUTH_FAILED` — stderr "Authentication failed; run `azdo auth login`." |
| 403 | `PERMISSION_DENIED` — stderr "Permission denied on pull request #<N>." |
| 404 | `NOT_FOUND` — stderr "Pull request #<N> not found in <org>/<project>/<repo>." |
| 5xx | `HTTP_<code>` — stderr "Azure DevOps returned <code>; retry later." |
| network | `NETWORK_ERROR` — stderr "Network error contacting Azure DevOps." |

New helper:

```ts
export async function getPullRequestById(
  context: AzdoContext,
  repo: string,
  pat: string,
  prId: number,
): Promise<BranchPullRequestMatch>
```

Reuses `mapPullRequest` to return the same shape as the existing branch
lookup (after the `url: string | null` relaxation).

## 2. `GET /pullRequests/{prId}/threads` — list threads (existing, behaviour change)

No URL or request change. Only the mapping changes:

- `mapThread` no longer filters by `status`. All threads flow through,
  with their original backend status preserved on
  `ActiveCommentThread.status`.
- Empty-thread suppression (threads where every comment is deleted or
  whitespace-only) stays in place.

No contract bump — the response shape is unchanged. Downstream consumers
that assumed only `active`/`pending` simply see a wider string union now.

## 3. `PATCH /pullRequests/{prId}/threads/{threadId}` — update thread status (new)

```
PATCH /pullRequests/{prId}/threads/{threadId}?api-version=7.1
Content-Type: application/json
Authorization: Basic <pat-b64>

{ "status": "fixed" }   # or "active" to reopen
```

### Response (200)

The updated `AzdoThread` — same shape as one element of the list-threads
response. The command only needs its `status` field to confirm the
transition.

### Error mapping

| HTTP | Behaviour |
| --- | --- |
| 401 | `AUTH_FAILED` as above. |
| 403 | `PERMISSION_DENIED` — "Permission denied updating thread #<id>." |
| 404 | `NOT_FOUND` — "Thread #<id> not found on pull request #<pr>." |
| 409 | `CONFLICT` — "Thread #<id> is locked and cannot be updated." |
| 5xx / network | same generic mapping. |

New helper:

```ts
export async function patchThreadStatus(
  context: AzdoContext,
  repo: string,
  pat: string,
  prId: number,
  threadId: number,
  status: "active" | "fixed",
): Promise<ActiveCommentThread>
```

Only `active` and `fixed` are accepted at the boundary; richer backend
states stay visible in the GET response but are not a target for this
feature's PATCH (per spec Out of scope).

## Notes on idempotency

The command layer reads the thread via the already-fetched list and
short-circuits when the thread is already in the target state. This is
NOT an optimisation — Azure DevOps tolerates a PATCH that reasserts the
current status, but skipping it removes needless writes and lets the
`--json` `noop` flag mean what it says.

## Notes on pagination

PR comment threads are not paginated in the Azure DevOps API — the
`threads` endpoint returns the full list in one response. No continuation
handling needed.
