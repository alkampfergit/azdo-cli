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

---

## Follow-up round: consumer feedback (2026-08-20)

### 9. Why the nested subcommands lost their options

Commander stores an option's value on the command that **declared** it. `pr comments` and its
`add` / `edit` / `reply` subcommands both declare `--org`, `--project`, `--repo`, `--pr-number` and
`--json`, so in `azdo pr comments add …` the value landed on the parent and the subcommand's own
`opts()` never saw it. Child-only options (`--file`, `--status`, `--dry-run`, `--comment-id`) worked,
which is exactly why the bug looked like "`--json` is ignored" instead of "the shared options are
lost".

Measured through a real command tree before fixing:

| Invocation | `--pr-number` | `--dry-run` | `--json` |
|------------|---------------|-------------|----------|
| `pr comments add …` (nested) | dropped | honoured | dropped |
| `pr comment-add …` (alias) | honoured | honoured | honoured |
| exported factory in isolation | honoured | honoured | honoured |

**Decision**: read `command.optsWithGlobals()` in the nested handlers rather than dropping the
duplicate declarations — the top-level aliases hang off `pr`, which declares none of these options,
so they need their own. `optsWithGlobals()` merges ancestors over the command itself, which is
correct here precisely because the value sits on the ancestor; none of the colliding options carries
a default that a child would need to override.

**Consequence for testing**: the per-command suites construct the exported factory directly, a shape
in which this class of bug cannot appear. `tests/unit/pr-command-tree.test.ts` was added to drive the
commands through `azdo pr …` as a user does, asserting the nested and alias forms behave identically.

### 10. The always-null `url`

`_links.web` is returned by the single-PR `GET`, not by the `GET .../pullrequests` list, so every
`pr list --json` consumer got `null` and rebuilt
`https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}` by hand — string-building the
CLI should own.

**Decision**: keep preferring the API's own link and fall back to building that URL. `mapPullRequest()`
therefore takes the `AzdoContext`. Alternative considered and rejected: dropping the field, which
would have broken every consumer that already reads it when present.

### 11. Author identity

`IdentityRef` carries `displayName`, `uniqueName` (the account, usually an email) and `id` (GUID).
Only the display name was mapped, and it is neither unique nor stable, so a consumer could not check
"is this PR mine?" — the check that decides whether a Guided Review plan comment is honoured.

**Decision**: additive flat fields `createdByUniqueName` / `createdById` rather than a nested
`createdByIdentity` object, to keep existing consumers untouched.

### 12. The identity behind the token

`GET /_apis/connectionData` returns `authenticatedUser` with `id`, `providerDisplayName` and
`properties.Account.$value`. It works for both PAT and OAuth credentials and needs no scope beyond
the one already used to connect, so no extra permission is required to answer "who am I?".

**Decision**: surface it on `azdo auth diagnose` (which already reports auth type, source and
connectivity) instead of adding a `whoami` command. Skipped when connectivity already failed — the
lookup would fail too — and any failure yields `identity: null`: diagnosing auth must never break
because of an extra call.

### 13. Exit codes

Everything failed with `1`, so a caller could not distinguish "not permitted" from "not found"
without matching stderr text. Precedent for meaningful codes already exists: `pipeline wait` maps
run results onto `0` / `1` / `2` / `124`.

**Decision**: `3` = an addressed resource is missing (pull request, thread, comment), `4` = not
permitted (auth failure or permission denied), `1` = everything else. Branch auto-detection
zero/multi-match stays at `1`: contract C-2/C-3 of `019-fix-pr-command` pins that code, and it is a
resolution failure rather than a named resource that is absent. Callers testing `!= 0` are unaffected.

### 14. `--contains` and truncation order

`--contains` exists to locate one thread (typically by an HTML-comment marker) without fetching and
pattern-matching everything client-side, and it is used together with `--max-chars`. Matching after
truncation would hide a marker that sits past the cut, so the substring test runs on the full body
and `--max-chars` is applied afterwards. `--exclude-system` runs first, so a marker inside a system
comment does not keep a thread alive.

`--thread` is a **selector**, not a filter: an id absent from the pull request exits `3` rather than
printing an empty listing, because the caller's next step is usually re-reading a thread it just
edited and a silent empty result would read as success.

### 15. Truncation metadata

` […]` is a content convention; asking a `--json` consumer to detect it is asking them to parse prose
to learn something about the data. `truncated` and `originalLength` are therefore always emitted for
every comment, whether or not `--max-chars` was passed.
