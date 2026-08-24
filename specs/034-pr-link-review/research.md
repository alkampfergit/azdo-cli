# Phase 0 Research: PR Work Item Links, Reviewer Management, and Template-Aware Creation

**Source**: Microsoft Learn MCP server (constitution Principle VI) — all three areas below were verified against `learn.microsoft.com` before any implementation code was proposed.

## 1. Adding / removing reviewers

- **Decision**: Use `PUT https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repositoryId}/pullRequests/{pullRequestId}/reviewers/{reviewerId}?api-version=7.1` with body `{ "vote": 0, "isRequired": true|false }` to add a reviewer or change their required/optional flag (an existing reviewer entry is updated in place — the API is idempotent on `reviewerId`, satisfying FR-011 without extra client-side logic). Use `DELETE` on the same URL to remove a reviewer.
- **Reviewer identity resolution**: `reviewerId` is the reviewer's identity GUID, not their email/unique name. Resolve it with the Identities API: `GET https://vssps.dev.azure.com/{org}/_apis/identities?searchFilter=General&filterValue={email-or-unique-name}&api-version=7.1`. Zero matches → FR-009's "unresolvable identity" error, naming the input string. More than one match is treated the same way (ambiguous input cannot be safely resolved).
- **Rationale**: This is the same pair of calls the `az repos pr reviewer add/remove` Azure CLI extension uses under the hood, and matches the `GitHttpClientBase.CreatePullRequestReviewerAsync` / `DeletePullRequestReviewerAsync` SDK surface exactly (reviewerId + repositoryId + pullRequestId, `isRequired` on the body).
- **Alternatives considered**: Sending `reviewer` display name directly to the reviewers endpoint — rejected; the endpoint requires the resolved GUID, there is no name-based variant.
- **Reviewer that is already required by branch policy**: the PUT/DELETE succeed at the API level regardless, but Azure DevOps enforces server-side that a policy-required reviewer cannot actually be removed from completing the PR — this shows up as a normal `HTTP_4xx` from `fetchWithErrors`, handled by the existing `handlePrCommandError` write-mode path. No new error-handling code needed.

## 2. Linking / unlinking work items

- **Decision**: A work item ↔ pull request link is a work item **relation** of type `ArtifactLink` whose `url` is the pull request's artifact URI: `vstfs:///Git/PullRequestId/{projectId}/{repositoryId}/{pullRequestId}` (all three segments are GUIDs/ids, not names). Link: `PATCH https://dev.azure.com/{org}/{project}/_apis/wit/workitems/{workItemId}?api-version=7.1` (`Content-Type: application/json-patch+json`) with body `[{"op":"add","path":"/relations/-","value":{"rel":"ArtifactLink","url":"<uri>","attributes":{"name":"Pull Request"}}}]`.
- **Unlink**: relations have no stable id in the response — removal is by array index. Fetch the work item with `?$expand=relations`, find the relation whose `url` equals the same artifact URI, and `PATCH` with `[{"op":"remove","path":"/relations/{index}"}]`. A work item with no matching relation satisfies FR-004 (no-op) without a network write.
- **Resolving `projectId` / `repositoryId`**: `projectId` is already available via the existing `resolveProjectId()` helper (used today for policy evaluations); `repositoryId` requires the repository's GUID, obtainable from `GET .../_apis/git/repositories/{repoNameOrId}?api-version=7.1` (name-to-GUID lookup) — a new, single-purpose call, since every other `pr-client.ts` function currently addresses repos by name in the URL path and never needed the GUID.
- **Rationale**: This is the exact mechanism the Work Item Batch Update reference documents for "Add an artifact link (build, pull request, commit, etc.)", and is what the ADO web UI itself does when a work item is linked from the PR overview panel.
- **Alternatives considered**: Driving the link from the *pull request* side instead of the *work item* side — rejected; Azure DevOps exposes PR↔work item links only as work item relations (`getPullRequestWorkItemRefs` is read-only), there is no PR-side write endpoint.
- **Nonexistent work item id** (FR-003): the work item GET (needed to compute the relation index even for linking, to detect an existing duplicate link per FR-005) 404s, which `fetchWithErrors` already maps to `NOT_FOUND` — reused as-is.

## 3. Repository-defined pull request templates

- **Decision**: Search order and file layout come directly from the official Azure DevOps convention (not invented by this feature):
  1. **Branch-specific**: `<root>/pull_request_template/branches/<branch-path>.md` (or `.txt`), checked under each of `.azuredevops/`, `.vsts/`, `docs/`, and the repository root, in that order. Multi-level branch names fall back from most to least specific — a PR into `feature/foo/december` checks `branches/feature/foo/december.md`, then `branches/feature/foo.md`, then `branches/feature.md` — matching the documented multi-level fallback (up to 10 levels).
  2. **Default**: if no branch-specific file matches, `<root>/pull_request_template.md` (or `.txt`) under the same four candidate roots, first match wins.
  3. Template files are **always read from the repository's default branch**, never from the PR's source or target branch — this is an Azure DevOps platform rule, not a choice made by this feature. In practice, for this repository the default branch (`develop`) is also where `docs/pull_request_template/branches/develop.md` already lives, so this is transparent for the reported use case; it becomes observable if a template file is ever added only to a feature branch.
- **File retrieval**: `GET https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repo}/items?path={encoded path}&versionDescriptor.version={defaultBranch}&versionDescriptor.versionType=branch&api-version=7.1&%24format=text` (raw content); a 404 means "no template at this candidate path", not an error — the search simply continues to the next candidate.
- **Rationale**: Reusing the platform's own template convention means an operator's existing `docs/pull_request_template/branches/develop.md` works with zero configuration, and matches FR-012/FR-013's fallback wording exactly.
- **Alternatives considered**: A CLI-specific template location/flag (e.g. `--template-dir`) — rejected; it would create a second, competing convention the operator would have to maintain alongside the one Azure DevOps already understands and applies in the web UI.

## Summary — Technical Context inputs

No `NEEDS CLARIFICATION` markers remain; all three integration points are resolved above against first-party documentation per constitution Principle VI.
