# Data Model: PR Work Item Links, Reviewer Management, and Template-Aware Creation

No new persisted storage — every entity below is a client-side shape over
an existing Azure DevOps resource, following the same pattern as
`BranchPullRequestMatch` / `ActiveCommentThread` in
`src/types/pull-request.ts`.

## WorkItemLink

Represents the association between one pull request and one work item.
Exists or does not exist — no independent state.

| Field | Type | Notes |
| --- | --- | --- |
| `pullRequestId` | `number` | The pull request the link is on. |
| `workItemId` | `number` | The linked work item's numeric id. |
| `url` | `string` | The `vstfs:///Git/PullRequestId/{projectId}/{repositoryId}/{pullRequestId}` artifact URI stored as the relation's `url`. Not surfaced to the CLI operator; kept only to detect/remove the correct relation. |

Source: a `WorkItemRelation` (`rel: "ArtifactLink"`) on the work item's
`relations` array, filtered to relations whose `url` matches the pull
request's artifact URI.

## Reviewer

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | Reviewer identity GUID, resolved from the operator-supplied email/unique name via the Identities API. |
| `displayName` | `string \| null` | For output only. |
| `uniqueName` | `string \| null` | For output only; the resolved input the operator supplied. |
| `isRequired` | `boolean` | Required vs. optional. Defaults to `false` (optional) per FR-007 when the operator does not pass `--required`. |
| `vote` | `number` | Read-only; Azure DevOps vote value (`0` = no vote). Never set by this feature — adding/updating a reviewer always sends `vote: 0` per the API's "vote must be zero when adding other reviewers" rule. |

Source: `IdentityRefWithVote` from the pull request reviewers endpoint.

## PullRequestTemplate

Not a write-side entity — a read-only lookup result used to pre-fill a
new pull request's description.

| Field | Type | Notes |
| --- | --- | --- |
| `path` | `string` | Repository-relative path where the template was found (e.g. `docs/pull_request_template/branches/develop.md`). |
| `content` | `string` | Raw file content, used verbatim as (or prepended-to by) the description. |
| `kind` | `"branch" \| "default"` | Which resolution rule matched, for `--json` transparency; not required by any FR but cheap to include since the resolver already knows it. |

Source: a single Git Items `GET` against the repository's **default**
branch (never the PR's source/target branch — see
[research.md](research.md#3-repository-defined-pull-request-templates)),
walked across the four candidate roots (`.azuredevops/`, `.vsts/`,
`docs/`, repository root) and, for branch-specific templates, from the
full target-branch path down to its first segment.

## Relationships

- `WorkItemLink` and `Reviewer` are both scoped to exactly one
  `BranchPullRequestMatch` (existing entity) — no new relationship to
  model beyond the existing PR resolution (`--pr-number` or current
  branch) already used by every other `pr` write command.
- `PullRequestTemplate` has no relationship to `WorkItemLink` or
  `Reviewer`; it only feeds the description text at PR-creation time in
  `pr open`.
