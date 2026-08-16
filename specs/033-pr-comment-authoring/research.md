# Research: PR Comment Authoring & Pull Request Lookup

**Feature**: `033-pr-comment-authoring` | **Date**: 2026-08-16

## 1. What the deleted scripts actually did

| Script | Azure DevOps call | CLI equivalent before this feature |
|--------|-------------------|------------------------------------|
| `add_pr_comment.ps1` | `POST .../pullrequests/{id}/threads` | **none** — `pr comments reply` only appends to an existing thread |
| `update_pr_comment.ps1` | `GET .../threads/{t}` then `PATCH .../threads/{t}/comments/{c}` | **none** |
| `get_pr_comments.ps1` | `GET .../pullrequests/{id}` + `GET .../threads` | `pr comments --pr-number <N>`, minus description / truncation / system filtering |
| `find_pr_for_branch.ps1` | `GET .../pullrequests?searchCriteria.sourceRefName=…&searchCriteria.status=…` | `pr status`, current branch only, with three extra calls per PR |

All four hardcoded `https://dev.azure.com/prxm`, project `Jarvis`, repository `Jarvis`, and read a
separate `AZDO_WI_PAT`. None of that survives: org/project come from `resolveContext()`, the
repository from the `origin` remote or the new `--repo`, and the credential from the existing auth
service (which already honours `AZDO_PAT` and the OS credential store).

## 2. Creating a thread vs replying to one

`POST .../pullRequests/{prId}/threads` with

```json
{ "comments": [{ "parentCommentId": 0, "content": "…", "commentType": 1 }] }
```

creates a thread with no `threadContext`, which is what the Overview tab shows as a general comment.
`commentType: 1` is the numeric enum for a human ("text") comment — the same value `postThreadComment()`
already sends when replying. `parentCommentId: 0` marks the comment as the thread root.

Adding `"status": "active"` (or any other thread status) at the top level makes the thread
resolvable. Omitting the key entirely is **not** the same as sending `"unknown"`: only omission
produces a plain comment, which is why `--status` maps to an optional key rather than a default value.

**Decision**: one transport function, `createPullRequestThread()`, returning the mapped thread via the
existing `toActiveCommentThread()` so the command can report the server-assigned thread and comment ids.

## 3. Editing a comment

`PATCH .../pullRequests/{prId}/threads/{threadId}/comments/{commentId}` with `{ "content": "…" }`
rewrites the body in place, preserving the thread, its id, and its ordering. Azure DevOps rejects the
call for any identity other than the comment's author (401/403), which `fetchWithErrors()` already maps
to `AUTH_FAILED` / `PERMISSION_DENIED`.

Choosing the comment: the scripts defaulted to the thread's first comment, which is the one that
created it — the "correct my own post" case. Keeping that default and exposing `--comment-id` for
anything else matches the script's semantics exactly.

Reading the thread first is unavoidable (we need the comment id and, for `--dry-run`, the previous
body). A single-thread `GET .../threads/{threadId}` is cheaper than the existing
`getPullRequestThreads()` list and never drops the thread through comment-level filtering, so
`getPullRequestThread()` was added rather than reusing the list call.

## 4. Listing pull requests

`GET .../pullrequests` accepts `searchCriteria.sourceRefName`, `searchCriteria.status`
(`active | completed | abandoned | all`), and `$top`. Omitting `sourceRefName` returns the whole
repository, so one URL builder covers both `pr status`'s branch lookup and the new repo-wide listing:
`buildPullRequestsUrl()` now takes `string | null` for the branch and an optional `top`.

**Decision**: a new `pr list` rather than options on `pr status`. `pr status` is the current-branch
overview that merges statuses, policy evaluations, and builds (three extra calls per PR); a lookup
that exists to answer "which PR is this?" should cost exactly one request.

**Decision**: `pr list` never falls back to the current branch. Implicit branch scoping is `pr status`'s
job, and a `list` command that silently filters would be surprising in scripts.

## 5. System comments

Threads carry `comments[].commentType`; Azure DevOps sets `system` for branch updates, reviewer votes,
build events, and similar. The script filtered on both `commentType` and the
`Microsoft.VisualStudio.Services.TFS` author name; `commentType === 'system'` alone is sufficient and
does not depend on a display name that varies by collection.

**Decision**: expose `commentType` on the mapped comment and filter at the command layer
(`--exclude-system`), opt-in, so existing output is untouched — consistent with how `--hide-resolved`
and `--code-related-only` were introduced in 023.

## 6. Truncation

`--max-chars <N>` cuts each comment body to N characters followed by ` […]`, the marker the script
used. `0` means "no limit" and is the default, so the flag is purely additive; the script's default of
500 would have silently changed existing output.

## 7. Body input

`set-md-field` and `upsert` already accept `--file <path>` with `existsSync` + `readFileSync`. The
same shape is reused for `add` / `edit` / `reply` through one `resolveCommentBody()` helper, including
the "cannot specify both" rule. Stdin was deliberately not added: the write commands run unattended in
CI, where reading a non-TTY stdin risks blocking.

`pr.ts` cannot use `set-md-field`'s `fail()` (which calls `process.exit()`) — issue #34 established
that a synchronous exit from an async action handler can race libuv on Windows — so the helper writes
the error, sets `process.exitCode`, and returns `null` for the caller to propagate.

## 8. `--dry-run`

No existing command has a dry-run flag, so this is new surface. It is kept because both new commands
write to a shared, human-visible artefact (a public PR) and the previous workflow relied on previewing
the body first. It is confined to the two write commands and prints to stdout with exit code 0.
