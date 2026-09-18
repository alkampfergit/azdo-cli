# Research: 039-pr-abandon

Constitution Principle VI — every claim below was verified against the
Microsoft Learn MCP server before any code was written.

## 1. Status is a documented updatable property

```http
PATCH https://dev.azure.com/{organization}/{project}/_apis/git/repositories/{repositoryId}/pullrequests/{pullRequestId}?api-version=7.1
```

Source: [Pull Requests — Update, REST 7.1](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-requests/update?view=azure-devops-rest-7.1)

Verbatim from that page:

> These are the properties that can be updated with the API:
> - Status
> - Title
> - Description (up to 4000 characters)
> - CompletionOptions
> - MergeOptions
> - AutoCompleteSetBy.Id
> - TargetRefName (when the PR retargeting feature is enabled)
> Attempting to update other properties outside of this list will either cause
> the server to throw an `InvalidArgumentValueException`, or to silently ignore
> the update.

`Status` is first on the list, so abandon/reactivate rides exactly the transport
038 already built — no new endpoint, no new helper. And the same warning that
justified 038's partial body applies here: the body carries `status` alone.

## 2. The status enumeration

`PullRequestStatus`, from the same page's Definitions section:

| Value | Description |
| --- | --- |
| notSet | Status not set. Default state. |
| active | Pull request is active. |
| abandoned | Pull request is abandoned. |
| completed | Pull request is completed. |
| all | Used in pull request search criteria to include all statuses. |

So abandon is `{"status":"abandoned"}` and reactivate is `{"status":"active"}`.
`all` and `notSet` are search/default values, never things to write.

## 3. Abandon is reversible, and is not a delete

Source: [Complete, abandon, or revert pull requests](https://learn.microsoft.com/azure/devops/repos/git/complete-pull-requests?view=azure-devops#abandon-or-reactivate-a-pull-request)

> To abandon your changes and your PR without merging, select **Abandon** from
> the dropdown list on the **Complete** button. You can still view the abandoned
> PR, and it stays linked to work items.
> To reactivate an abandoned PR at any time, open the PR from the **Abandoned**
> tab in the **Pull Request** view, and select **Reactivate** at upper right.

Three consequences for the spec:

1. Nothing is destroyed — comments, threads and work-item links survive. This is
   what makes "no confirmation prompt" (FR-008) defensible.
2. Reactivation is unconditional from the server's side for an abandoned PR, so
   the CLI needs no extra state to restore.
3. An abandoned PR is still listable — `pr list --status abandoned` already
   works — which is what makes the reactivate branch lookup (FR-004) possible.

The same page confirms the `az repos pr update --id <id> --status abandoned`
shape ("You can reactivate the PR by setting the status to `active`"), i.e.
Microsoft's own CLI models this as exactly the status `PATCH` used here, and
[Review pull requests](https://learn.microsoft.com/azure/devops/repos/git/review-pull-requests?view=azure-devops#complete-a-pr)
calls the pair "**Abandon**: Close the PR … select **Reactivate** to restore it"
— the source of the `close` alias (FR-011).

## 4. Completed pull requests

The docs list `completed` as a terminal status: the **Abandon** action lives in
the dropdown of the **Complete** button and disappears once the PR is completed;
the reverse of a completed PR is a *revert* (a new PR), not a status flip. The
CLI therefore refuses the transition client-side (FR-007) using the status it
already fetched, and keeps the 037 error surfacing as the backstop if the server
rejects a transition the CLI did not predict.

## 5. Scope

`vso.code_write` — the same scope the rest of the `pr` write commands already
require. No new scope, no new host, no new authorization boundary (unlike
`pr reviewers`, which needs Identity (Read)).
