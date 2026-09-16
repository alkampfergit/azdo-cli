# Research: 038-pr-update

Constitution Principle VI — every claim below was verified against the
Microsoft Learn MCP server before any code was written.

## 1. The update endpoint

```http
PATCH https://dev.azure.com/{organization}/{project}/_apis/git/repositories/{repositoryId}/pullrequests/{pullRequestId}?api-version=7.1
```

Source: [Pull Requests — Update, REST 7.1](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-requests/update?view=azure-devops-rest-7.1)

Verbatim from that page:

> These are the properties that can be updated with the API:
> Status, Title, **Description (up to 4000 characters)**, CompletionOptions,
> MergeOptions, AutoCompleteSetBy.Id, TargetRefName (when the PR retargeting
> feature is enabled). Attempting to update other properties outside of this
> list will either cause the server to throw an `InvalidArgumentValueException`,
> or to silently ignore the update.

Consequences for this feature:

- **Send only what changed.** The body is a partial `GitPullRequest`; omitted
  properties are left alone. So `--title` alone sends `{"title": …}` and the
  description is provably untouched — no read-modify-write is needed for
  correctness (we still read the PR, but for no-op detection, not for merging).
- **Never echo the fetched PR back.** Posting the whole object would include
  properties outside the updatable list and risk the documented
  `InvalidArgumentValueException` / silent-ignore behaviour.
- **4000 characters** is the same cap `pr open` already pre-flights
  (`MAX_PR_DESCRIPTION_CHARS` in `src/services/pr-client.ts`), and this page is
  the source that constant already cites. Reused as-is.
- **Response** is `200 OK` with the full `GitPullRequest`, so the updated title
  and description can be reported from the server's answer rather than echoed
  from the request.
- **Scope**: `vso.code_write` — the same scope every other `pr` write already
  needs. No new PAT scope, no new host (unlike the reviewers path, which needs
  `vssps.dev.azure.com` and Identity (Read)).

Note the casing quirk in the documented path (`pullrequests` on update vs
`pullRequests` on get). Azure DevOps routes are case-insensitive and the
existing client already mixes both forms; this feature follows the documented
lowercase form for the PATCH.

## 2. No-op detection

There is no conditional-update primitive (no ETag / `If-Match` on this route),
so "did anything change?" has to be answered client-side. The PR is already
fetched before the write in every path:

- `--pr-number` → `getPullRequestById` (already called by
  `resolvePullRequestTarget`)
- no `--pr-number` → `listPullRequests` for the current branch (same helper)

`mapPullRequest` already projects `title` and `description` (trimmed, `null`
when empty) onto `BranchPullRequestMatch`, so the comparison costs **zero extra
round trips**. This is the same shape of check `pr reviewers add` and
`pr work-items link` use to produce `noop: true`.

## 3. Template semantics on update

`pr open` composes `description + "\n\n" + template` when a repository pull
request template resolves (`composeDescription`). Applying that on update would
re-prepend the template on every single edit, growing the description without
bound. Issue #96 proposes literal replacement and the owner approved starting
the story with that proposal on the table; it is recorded as FR-006 and stated
in the flag's help text so the difference from `pr open` is visible at
`--help`, not just in the docs.

## 4. Stdin as `-`

Issue #96 asks for `-` to mean stdin "consistent with that helper". The
existing helper (`resolveCommentBody`) does **not** actually implement it today —
`--file -` currently fails with `File not found: -`. Rather than adding a
second, divergent reader for the new flags, `-` is implemented **inside**
`resolveCommentBody`, which makes `azdo pr comments add --file -` work too.

Node reads stdin synchronously with `readFileSync(0, 'utf-8')` — already the
idiom available with the module's existing `node:fs` import, no new dependency.
Stdin can only be drained once, so using `-` for both `--title-file` and
`--description-file` in one invocation is rejected up front (FR-005).
