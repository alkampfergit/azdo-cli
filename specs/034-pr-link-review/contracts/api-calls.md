# Azure DevOps API contracts — 034-pr-link-review

All calls authenticated with the existing `authHeaders(pat)` helper in
`src/services/azdo-client.ts` and routed through the existing
`fetchWithErrors` wrapper, so auth/permission/network/not-found errors
map to the repo's standard error codes exactly as every other `pr-client.ts`
function already does.

Base URL for Git endpoints:
`https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repo}/`.
Base URL for Work Item Tracking endpoints:
`https://dev.azure.com/{org}/{project}/_apis/wit/`.
Base URL for Identities:
`https://vssps.dev.azure.com/{org}/_apis/identities`.
API version param on every call: `api-version=7.1`.

## 1. `GET /_apis/git/repositories/{repo}` — resolve repository GUID (new)

Needed to build the PR artifact URI for work item links (`repositoryId`
is a GUID, not the repo name already used everywhere else in
`pr-client.ts`).

```
GET /_apis/git/repositories/{repo}?api-version=7.1
```

### Response (200)

`{ "id": "<repo-guid>", ... }` — only `id` is used.

### Error mapping

Same as every other Git endpoint: 401 → `AUTH_FAILED`, 403 →
`PERMISSION_DENIED`, 404 → `NOT_FOUND` ("Azure DevOps repository not
found"), 5xx → `HTTP_<code>`.

## 2. `PUT /_apis/git/repositories/{repo}/pullRequests/{prId}/reviewers/{reviewerId}` — add or update a reviewer (new)

```
PUT .../pullRequests/{prId}/reviewers/{reviewerId}?api-version=7.1
Content-Type: application/json

{ "vote": 0, "isRequired": true }
```

`isRequired: false` (or omitted) adds/keeps the reviewer optional (FR-007
default). Called against an existing reviewer id to change their
required flag in place (FR-011) — Azure DevOps treats this as an update,
not a duplicate.

### Response (200)

`IdentityRefWithVote` — `{ id, displayName, uniqueName, isRequired, vote }`.

### Error mapping

| HTTP | Behaviour |
| --- | --- |
| 401 | `AUTH_FAILED` |
| 403 | `PERMISSION_DENIED` |
| 404 | `NOT_FOUND` — pull request does not exist |
| 5xx | `HTTP_<code>` |

A policy-required reviewer that cannot actually be removed surfaces as a
normal HTTP error from the DELETE call (§3) — no special-casing needed.

## 3. `DELETE /_apis/git/repositories/{repo}/pullRequests/{prId}/reviewers/{reviewerId}` — remove a reviewer (new)

```
DELETE .../pullRequests/{prId}/reviewers/{reviewerId}?api-version=7.1
```

204 on success. Same error mapping as §2. Removing a reviewer not
currently on the PR (FR-010, no-op) is detected client-side by checking
the existing reviewer list before issuing the DELETE — Azure DevOps
itself 404s on an unknown reviewer id, which the client-side check
avoids surfacing as an error.

## 4. `GET /_apis/identities?searchFilter=General&filterValue={input}` — resolve a reviewer identity (new)

```
GET https://vssps.dev.azure.com/{org}/_apis/identities?searchFilter=General&filterValue={email-or-unique-name}&api-version=7.1
```

### Response (200)

`{ "value": [ { "id": "<guid>", "providerDisplayName": "...", ... }, ... ] }`

- Zero results → FR-009 "unresolvable identity" error, naming the input.
- Exactly one result → use its `id`.
- More than one result → treated the same as zero (ambiguous input is
  not safely resolvable); error names the input and reports the match
  count.

## 5. `GET /_apis/wit/workitems/{id}?$expand=relations` — read a work item's relations (new)

```
GET /_apis/wit/workitems/{id}?$expand=relations&api-version=7.1
```

Used before both link (to detect an existing duplicate per FR-005) and
unlink (to find the relation's array index per FR-004).

### Error mapping

404 → `NOT_FOUND`, reused as FR-003's "work item does not exist" error
when linking.

## 6. `PATCH /_apis/wit/workitems/{id}` — add or remove the PR artifact link (new)

```
PATCH /_apis/wit/workitems/{id}?api-version=7.1
Content-Type: application/json-patch+json

# Link:
[{ "op": "add", "path": "/relations/-", "value": {
     "rel": "ArtifactLink",
     "url": "vstfs:///Git/PullRequestId/{projectId}/{repositoryId}/{prId}",
     "attributes": { "name": "Pull Request" }
} }]

# Unlink (index from step 5's relations array):
[{ "op": "remove", "path": "/relations/{index}" }]
```

### Response (200)

The updated work item; not consumed beyond confirming success.

### Error mapping

Same as §5, plus 400 (malformed patch — should not occur given the
fixed shape above) → generic `HTTP_400`.

## 7. `GET /_apis/git/repositories/{repo}/items` — read a pull request template file (new)

```
GET /_apis/git/repositories/{repo}/items?path={encoded-path}&versionDescriptor.version={defaultBranch}&versionDescriptor.versionType=branch&includeContent=true&api-version=7.1
```

Called once per candidate path (branch-specific paths from most to
least specific, across the four candidate roots, then the default
template across the same four roots) until one returns 200 or the list
is exhausted.

### Response (200)

Raw file content (Markdown/text) — used verbatim as the template's
`content`.

### Error mapping

404 → not an error; the resolver continues to the next candidate path.
Any other error code aborts the search (surfaced like any other
`pr open` failure) rather than silently falling through to "no
template".
