# Research: Pull Request Handling

**Date**: 2026-03-27
**Feature**: 008-pull-request-handling

## R1: Command Structure

**Decision**: Expose the feature as a top-level `pr` command group with three subcommands: `azdo pr status`, `azdo pr open`, and `azdo pr comments`.

**Rationale**: The spec describes three distinct user goals with different side effects and result shapes. A command group keeps the UX discoverable and aligns with the constitution requirement that each command does one thing well while still presenting pull-request behavior under one cohesive namespace. Names are clarified per session 2026-03-27: `status` for discovery, `open` for creation, `comments` for discussion retrieval.

**Alternatives considered**:
1. `pr list` / `pr create` naming. Rejected during clarification in favour of `status` / `open` which better reflect intent.
2. Three unrelated top-level commands such as `pr-status`. Rejected because a nested group is more discoverable.
3. One `azdo pr` command with mode flags. Rejected because it combines read and write operations.

## R2: Branch and Repository Resolution

**Decision**: Resolve the current branch from local git state via `git rev-parse --abbrev-ref HEAD`. Extend `git-remote.ts` with a new `parseRepoName()` pure function and a `detectRepoName()` function that extracts the repository name from the `origin` remote URL.

**Rationale**: FR-002 requires branch detection without repeating it as a flag. Existing context resolution already uses `origin` for org/project. Pull request APIs also require the repository identity. Adding `parseRepoName()` and `detectRepoName()` keeps the pattern consistent with `parseAzdoRemote()` / `detectAzdoContext()` without modifying `AzdoContext` or any existing command.

**Alternatives considered**:
1. Add `repo` field to `AzdoContext` — rejected because it requires updating all callers of the existing context resolution chain.
2. Require `--repo` flag — rejected because the remote already has the information.
3. Parse `.git/HEAD` manually — rejected because `git rev-parse` is simpler and consistent.

## R3: Azure DevOps PR REST API (v7.1)

**Decision**: Use Azure DevOps Git REST endpoints with the existing fetch-based `fetchWithErrors` pattern.

### List Pull Requests

```
GET https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repo}/pullrequests
    ?searchCriteria.sourceRefName=refs/heads/{branch}
    &searchCriteria.status=active          ← used for duplicate check before open
    &searchCriteria.targetRefName=refs/heads/develop  ← narrow for duplicate check
    &api-version=7.1
```

PAT scope: `Code (Read)` (`vso.code`)

Response shape (key fields):
```json
{
  "value": [
    {
      "pullRequestId": 22,
      "title": "My feature",
      "status": "active",
      "sourceRefName": "refs/heads/feature-branch",
      "targetRefName": "refs/heads/develop",
      "createdBy": { "displayName": "Alice" },
      "_links": { "web": { "href": "https://dev.azure.com/org/_git/repo/pullrequest/22" } }
    }
  ],
  "count": 1
}
```

### Create Pull Request

```
POST https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repo}/pullrequests
     ?api-version=7.1
```

Request body (both `title` and `description` are required per clarification 2026-03-27):
```json
{
  "sourceRefName": "refs/heads/feature-branch",
  "targetRefName": "refs/heads/develop",
  "title": "<value of --title flag>",
  "description": "<value of --description flag>"
}
```

PAT scope: `Code (Read & Write)` (`vso.code_write`)
Response: 201 Created → same `GitPullRequest` shape as list item.

### List Pull Request Threads

```
GET https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repo}/pullRequests/{prId}/threads
    ?api-version=7.1
```

PAT scope: `Code (Read)` (`vso.code`)

Response shape (key fields):
```json
{
  "value": [
    {
      "id": 147,
      "status": "active",
      "threadContext": { "filePath": "/src/index.ts" },
      "comments": [
        {
          "id": 1,
          "author": { "displayName": "Alice" },
          "content": "Please handle the error case.",
          "isDeleted": false
        }
      ]
    }
  ]
}
```

**Rationale**: The repository already uses native `fetch` for work items; PR operations follow the same transport model.

**Alternatives considered**: Azure DevOps SDK — rejected because it increases dependency surface. Shell out to `az repos pr` — rejected because this project is itself a CLI.

## R4: Duplicate Prevention for `pr open`

**Decision**: Before creating a pull request, query active PRs where `sourceRefName = refs/heads/<branch>` AND `targetRefName = refs/heads/develop`. Zero matches → create. One match → return it with `created: false`. Multiple matches → fail with actionable ambiguity message.

**Rationale**: FR-007 / FR-008 require duplicate prevention. The spec edge cases explicitly mention multiple active PRs on one branch.

## R5: Active Comment Filtering

**Decision**: Active threads are those with `status === 'active'` or `status === 'pending'`. Within each active thread, include only comments where `isDeleted !== true` and `content` is non-empty.

### Thread status values

| Value | Include? |
|-------|----------|
| `active` | Yes |
| `pending` | Yes |
| `fixed` | No |
| `wontFix` | No |
| `closed` | No |
| `byDesign` | No |
| `unknown` | No |

**Alternatives considered**: Filter only on comment content ignoring thread status — rejected because closed threads with visible comments are not actionable work.

## R6: PR Status Values

| Value | Meaning |
|-------|---------|
| `active` | Open for review |
| `completed` | Merged |
| `abandoned` | Closed without merging |
| `notSet` | Default/unset |

## R7: PAT Scope Summary

| Command | Required Scope |
|---------|---------------|
| `pr status` | Code (Read) |
| `pr comments` | Code (Read) |
| `pr open` | Code (Read & Write) |

Existing `resolvePat()` is reused. No new auth mechanism needed.

## R8: Branch Reference Format

The PR API requires `refs/heads/{branchName}` for both source and target. Format internally in `pr-client.ts` so callers pass plain branch names (e.g., `develop`, `feature-x`).
