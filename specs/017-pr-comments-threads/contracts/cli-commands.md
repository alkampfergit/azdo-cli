# CLI command contracts — 017-pr-comments-threads

All commands live under the existing `azdo pr` parent (registered in
`src/commands/pr.ts`). Exit-code convention across all three: **0** on
success (including idempotent no-ops per FR-011), **non-zero** on
validation / not-found / unexpected error.

## `azdo pr comments`

Existing command; existing flags (`--org`, `--project`, `--json`) stay.

### New flags

| Flag | Type | Required | Default | Behaviour |
| --- | --- | --- | --- | --- |
| `--pr-number <N>` | integer | no | *(unset — use branch lookup)* | Target PR `N` directly, skipping branch-based resolution. Must be a positive integer. |
| `--hide-resolved` | boolean | no | false | Exclude threads whose status is a settled one (`fixed`, `wontFix`, `closed`, `byDesign`) from output. |

### Exit codes

| Code | When |
| --- | --- |
| 0 | Threads (or "no comments") printed successfully. |
| 1 | No active PR on the branch AND `--pr-number` not provided; OR `--pr-number` is invalid; OR PR not found; OR auth/network error. |

### Output

- Default (human-readable): each thread rendered with a status indicator
  prefix, e.g. `[active] thread #42 — path/to/file.ts`, followed by its
  comments (author, date, first line of content). Empty threads (no
  non-deleted content) are suppressed.
- `--json`: the same `PullRequestCommentsResult` shape currently emitted,
  except `threads[*].status` now carries the full enum (`"fixed"`,
  `"wontFix"`, ...). Consumers that previously only saw `active`/`pending`
  are unaffected in practice because the backend had been coercing them
  already via the `mapThread` filter; no explicit version bump needed.

### Error messages (stderr)

- `No active pull request found for branch <branch>.`
- `Multiple active pull requests found for branch <branch>: #<id>, #<id>. Use pr status to review them.`
- `Invalid --pr-number "<raw>"; expected a positive integer.`
- `Pull request #<N> not found in <org>/<project>/<repo>.`
- `Unable to list comments: <mapped-http-error>.`

## `azdo pr comment-resolve <threadId>`

New command. Resolves a comment thread.

### Flags

| Flag | Required | Default | Behaviour |
| --- | --- | --- | --- |
| `--org <org>`, `--project <project>` | no | from `AzdoContext` | same shape as `pr comments`. |
| `--pr-number <N>` | no | branch-based | same as `pr comments`. |
| `--json` | no | false | Emit the mutation result as JSON. |

### Positional arguments

| Name | Type | Required | Behaviour |
| --- | --- | --- | --- |
| `threadId` | integer | yes | The thread to resolve. Must be a positive integer. |

### Exit codes

| Code | When |
| --- | --- |
| 0 | Thread was active/pending → PATCHed to `fixed`; OR thread already in a settled state → no-op (idempotent). |
| 1 | `threadId` invalid; OR thread not found on the PR; OR auth/network error. |

### Output (stdout)

- Success (mutation): `Thread #<id> resolved on pull request #<pr>.`
- Success (no-op): `Thread #<id> is already resolved on pull request #<pr>.`
- `--json` variant: `{ "pullRequestId": 64, "threadId": 17, "status": "fixed", "noop": false }`.

## `azdo pr comment-reopen <threadId>`

Mirror of `pr comment-resolve`. Flips settled → `active`.

Same flags, same positional arg, same exit codes.

Output:
- Success (mutation): `Thread #<id> reopened on pull request #<pr>.`
- Success (no-op): `Thread #<id> is already active on pull request #<pr>.`
- `--json`: `{ "pullRequestId": 64, "threadId": 17, "status": "active", "noop": true }`.

## Idempotency guarantees (applies to both state-change commands)

1. Command fetches the current thread via `getPullRequestThreads` (or a
   subsequent `getPullRequestThreadById` helper — see
   [api-calls.md](./api-calls.md)).
2. If the thread is already in the target state, skip the PATCH entirely
   — no backend write, no side effects.
3. Exit with status 0 regardless of whether a mutation happened. The
   `noop` field in `--json` output distinguishes the two.

## Backwards compatibility

- `azdo pr comments` with no new flags: identical surface + output
  **except** that resolved threads now appear in the listing by default
  (previously filtered out silently). Opt out with `--hide-resolved`.
- `--json` consumers: `threads[*].status` may now contain values outside
  `active`/`pending`. Documented in the release notes; no schema version
  bump since the field was always typed as a string.
