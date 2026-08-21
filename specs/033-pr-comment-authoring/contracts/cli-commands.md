# CLI command contracts — 033-pr-comment-authoring

Exit-code convention: **0** on success (including a no-op dry run), **non-zero** on any
validation / not-found / auth / network error. Errors go to stderr, results to stdout.

Every command below also accepts the group-wide options:

| Flag | Default | Behaviour |
|------|---------|-----------|
| `--org <org>` | from `AzdoContext` | Azure DevOps organisation |
| `--project <project>` | from `AzdoContext` | Azure DevOps project |
| `--repo <name>` | repository of the git `origin` remote | Target repository; skips the git remote lookup entirely |
| `--json` | false | Emit the result as JSON on stdout |

---

## `azdo pr comments add [text]` *(canonical)* / `azdo pr comment-add [text]` *(alias)*

Creates a **new** comment thread on the pull request overview.

### Positional arguments

| Name | Required | Behaviour |
|------|----------|-----------|
| `text` | no | Comment body. Mutually exclusive with `--file`; exactly one of the two must be present. |

### Options

| Flag | Default | Behaviour |
|------|---------|-----------|
| `--file <path>` | — | Read the body from a UTF-8 file instead of the inline argument |
| `--status <status>` | none | `active \| fixed \| wontFix \| closed \| byDesign \| pending`. Omitted ⇒ plain, non-resolvable comment |
| `--dry-run` | false | Resolve the target PR, print what would be posted, write nothing, exit 0 |
| `--pr-number <N>` | branch-based | Target PR directly, bypassing the branch lookup |

### Output (success)

```
Comment posted to pull request #<prId> (thread #<threadId>).
```

`--json`:

```json
{
  "pullRequestId": 64,
  "threadId": 71936,
  "commentId": 1,
  "status": "active",
  "content": "…",
  "dryRun": false
}
```

`--dry-run` (human-readable) prints `Dry run: would post a new comment thread[ with status <s>] on
pull request #<prId> (<n> chars).` followed by the body; `--dry-run --json` emits the same object with
`threadId` and `commentId` `null`, `status` set to the requested status (or `null`), and `dryRun: true`.

---

## `azdo pr comments edit <threadId> [text]` *(canonical)* / `azdo pr comment-edit …` *(alias)*

Rewrites an existing comment in place, keeping the thread and its position in the discussion.

### Positional arguments

| Name | Required | Behaviour |
|------|----------|-----------|
| `threadId` | yes | Positive integer; validated before any network call |
| `text` | no | New body. Mutually exclusive with `--file`; exactly one must be present |

### Options

| Flag | Default | Behaviour |
|------|---------|-----------|
| `--comment-id <N>` | thread's first comment | Which comment inside the thread to rewrite |
| `--file <path>` | — | Read the new body from a UTF-8 file |
| `--dry-run` | false | Resolve the target comment, print the replacement, write nothing, exit 0 |
| `--pr-number <N>` | branch-based | Target PR directly |

### Output (success)

```
Comment #<commentId> updated in thread #<threadId> on pull request #<prId>.
```

`--json`:

```json
{
  "pullRequestId": 64,
  "threadId": 148,
  "commentId": 3,
  "previousContent": "…",
  "content": "…",
  "dryRun": false
}
```

`--dry-run` prints `Dry run: would replace comment #<c> in thread #<t> on pull request #<pr>
(<old> chars -> <new> chars).` followed by the new body.

---

## `azdo pr list`

Lists the repository's pull requests in a single API call. Never falls back to the current branch —
that is `pr status`.

### Options

| Flag | Default | Behaviour |
|------|---------|-----------|
| `--branch <name>` | none | Filter by source branch; a leading `refs/heads/` is accepted and stripped |
| `--status <status>` | `active` | `active \| completed \| abandoned \| all` |
| `--top <N>` | 25 | Maximum number of pull requests returned (`$top`) |

### Output (success)

```
#4804 [active] Multiple orders
  feature/19384_multiple_orders -> develop
  Author: Alice
  https://dev.azure.com/…/pullrequest/4804
```

Blocks are separated by a blank line. With no match: `No <status> pull request found in <repo>[ for
branch <branch>].`, exit 0.

`--json`:

```json
{
  "repository": "repo-name",
  "branch": "feature/19384_multiple_orders",
  "status": "active",
  "pullRequests": [ { "id": 4804, "title": "…", "sourceRefName": "…", "targetRefName": "…",
                      "status": "active", "createdBy": "Alice", "url": "…", "description": "…" } ]
}
```

---

## `azdo pr comments` — new flags

| Flag | Default | Behaviour |
|------|---------|-----------|
| `--exclude-system` | false | Drop Azure DevOps system comments; a thread left with no comments disappears |
| `--max-chars <N>` | 0 | Truncate each comment body to N characters plus ` […]`; `0` means no limit |
| `--thread <id>` | — | Return only that thread. A **selector, not a filter**: an id absent from the pull request exits 1 with `Thread #<id> not found on pull request #<pr>.` |
| `--contains <text>` | — | Keep only threads holding a comment containing that literal, case-sensitive substring. Matched on the FULL body, before `--max-chars` truncates |

Both are honoured in `--json`. With neither flag the output is unchanged from the previous release.
When filters remove everything, the message names the applied filters, e.g. `Pull request #12 has no
code-related unresolved non-system comment threads (filtered from 4 threads).`

## `azdo pr comments reply` / `azdo pr comment-reply` — new flag

| Flag | Default | Behaviour |
|------|---------|-----------|
| `--file <path>` | — | Read the reply body from a UTF-8 file; mutually exclusive with the inline `text` argument, which is now optional |

---

## Error messages (stderr)

New:

- `Cannot specify both inline text and --file.`
- `Comment text must not be empty. Pass the text inline or use --file <path>.`
- `File not found: <path>` / `Cannot read file: <path>`
- `Invalid --status "<raw>"; expected one of active, fixed, wontFix, closed, byDesign, pending.` *(add)*
- `Invalid --status "<raw>"; expected one of active, completed, abandoned, all.` *(list)*
- `Invalid --top "<raw>"; expected a positive integer.`
- `Invalid --max-chars "<raw>"; expected a non-negative integer.`
- `Invalid --comment-id "<raw>"; expected a positive integer.`
- `Comment #<id> not found in thread #<t> on pull request #<pr>.`
- `Thread #<t> on pull request #<pr> has no editable comment.`

Unchanged and reused verbatim from 019 / 023 / 029:

- `Invalid thread id "<raw>"; expected a positive integer.`
- `Invalid --pr-number "<raw>"; expected a positive integer.`
- `No open pull request matches branch <branch>. Pass --pr-number to target a specific PR, or push the branch and open a pull request.`
- `Multiple open pull requests match branch <branch>: #<id>, #<id>. Re-run with --pr-number to choose.`
- `Pull request #<N> not found in <org>/<project>/<repo>.`
- `Thread #<id> not found on pull request #<pr>.`
- `Reply text must not be empty.` *(reply only, when no body is supplied at all)*

---

## Consumer-report round (post-release feedback)

### `pr comments --json` per-comment fields

| Field | Always present | Meaning |
|-------|----------------|---------|
| `commentType` | yes | `text` / `system` as returned by Azure DevOps |
| `truncated` | yes | Whether `--max-chars` cut this body — never inferred from the ` […]` marker |
| `originalLength` | yes | Length before truncation |

### Pull request JSON fields

| Field | Behaviour |
|-------|-----------|
| `url` | Always populated. The PR *list* response omits `_links.web`, so the CLI builds `https://dev.azure.com/<org>/<project>/_git/<repo>/pullrequest/<id>` when the API link is absent. Previously always `null` on `pr list` |
| `description` | Trimmed overview description, `null` when empty |
| `createdBy` | Display name — unchanged |
| `createdByUniqueName` | Author account (usually an email), `null` when absent |
| `createdById` | Author identity GUID, `null` when absent |

### Option plumbing (fixed)

`pr comments` and its `add` / `edit` / `reply` subcommands both declare
`--org`, `--project`, `--repo`, `--pr-number` and `--json`. Commander stores an option's value on
the command that declared it, so in the nested form (`azdo pr comments add …`) the value landed on
the parent and the subcommand never saw it: `--json` printed the human summary, and `--pr-number`
silently fell back to the current branch's pull request — a write could land on a different PR than
the one requested. The nested subcommands now read `optsWithGlobals()`. The `pr comment-add` /
`comment-edit` / `comment-reply` aliases hang off `pr`, have no colliding ancestor, and were never
affected.

Regression coverage lives in `tests/unit/pr-command-tree.test.ts`, which drives the commands through
a real `azdo pr …` tree; the per-command suites exercise the factories in isolation and cannot
observe this class of bug.

### Exit codes

| Code | When |
|------|------|
| 0 | Success, dry runs and idempotent no-ops included |
| 1 | Validation failure, network error, unexpected HTTP status |
| 3 | Addressed resource missing: pull request (`--pr-number`), thread (`--thread` / `<threadId>`), comment (`--comment-id`) |
| 4 | Not permitted: `AUTH_FAILED` or `PERMISSION_DENIED` |

Branch auto-detection zero/multi-match stays at **1** — contract C-2/C-3 of `019-fix-pr-command`
pins that code, and it is a resolution failure rather than a named resource that is absent.
Covered by `tests/unit/pr-exit-codes.test.ts`, driven through a real `azdo pr …` tree.

### Credential identity (`azdo auth diagnose`)

`AuthDiagnosticReport` gains `identity: { displayName, uniqueName, id } | null`, resolved from
`GET /_apis/connectionData`. It answers "does the token about to write belong to the PR author?" —
compare `identity.uniqueName` with the pull request's `createdByUniqueName`. Null when there is no
credential, when connectivity already failed (the lookup is skipped, saving a request), or when the
lookup failed; diagnosing auth never breaks because of this extra call.

### Authentication failure message

Line 1 is unchanged from previous releases. A second, indented line names the credential actually
used and how to replace it:

```
Error: Authentication failed. Check that your PAT is valid and has the "Code (Read & Write)" scope.
  Token used: PAT from the AZDO_PAT environment variable (it takes precedence over the stored credential). Fix: give that token the scope above, or unset AZDO_PAT to fall back to the stored credential.
```

Sources reported: the `AZDO_PAT` environment variable, the OS credential store (naming the org, and
distinguishing a PAT from an OAuth access token), or an interactive prompt.

## Backwards compatibility

- No existing flag, output line, or exit code changes.
- `--json` payloads gain two additive fields: `description` on pull requests, `commentType` on comments.
- `azdo pr comments reply <threadId> <text>` keeps working; `text` merely became optional so `--file` can replace it.
- The `pr` group gains `list`, `comment-add`, and `comment-edit`; `pr comments` gains `add` and `edit`.
