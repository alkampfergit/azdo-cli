# CLI command contracts — 029-pr-comment-reply

Both commands share the same behaviour. Only the name/registration point differs.

Exit-code convention: **0** on success, **non-zero** on any validation / not-found / auth / network error.

---

## `azdo pr comments reply <threadId> "<text>"` *(canonical)*

Registered as a subcommand of `azdo pr comments`.

### Positional arguments

| Name | Type | Required | Behaviour |
|------|------|----------|-----------|
| `threadId` | integer | yes | Numeric ID of the target thread. Must be a positive integer. Validated before any network call. |
| `text` | string | yes | The reply text to post. Must be non-empty after trimming. Validated before any network call. |

### Options

| Flag | Type | Required | Default | Behaviour |
|------|------|----------|---------|-----------|
| `--org <org>` | string | no | from `AzdoContext` | Azure DevOps organisation |
| `--project <project>` | string | no | from `AzdoContext` | Azure DevOps project |
| `--pr-number <N>` | integer | no | branch-based | Target PR directly, bypassing branch lookup |
| `--json` | boolean | no | false | Emit result as JSON on stdout |

### Exit codes

| Code | When |
|------|------|
| 0 | Comment posted successfully |
| 1 | Validation failure (non-integer or missing threadId, empty text, invalid --pr-number) |
| 1 | PR not found (branch lookup or --pr-number) |
| 1 | Thread not found on the PR |
| 1 | Auth failure, permission denied, network error, or server error |

### Output (stdout, success)

**Human-readable** (default):
```
Reply posted to thread #<threadId> on pull request #<prId>.
```

**`--json`**:
```json
{
  "pullRequestId": 22,
  "threadId": 148,
  "commentId": 3,
  "content": "Great suggestion!"
}
```

### Error messages (stderr)

- `Invalid thread id "<raw>"; expected a positive integer.`
- `Reply text must not be empty.`
- `Invalid --pr-number "<raw>"; expected a positive integer.`
- `No open pull request matches branch <branch>. Pass --pr-number to target a specific PR, or push the branch and open a pull request.`
- `Multiple open pull requests match branch <branch>: #<id>, #<id>. Re-run with --pr-number to choose.`
- `Pull request #<N> not found in <org>/<project>/<repo>.`
- `Thread #<id> not found on pull request #<pr>.`
- `Unable to post comment: <mapped-http-error>.`

---

## `azdo pr comment-reply <threadId> "<text>"` *(alias)*

Registered as a top-level subcommand of `azdo pr` (alongside `comment-resolve` and `comment-reopen`).

**Identical** in all respects to `azdo pr comments reply`: same positional arguments, same options, same output, same exit codes, same error messages.

The `--help` description reads:
```
Post a reply to a pull request comment thread (alias of "azdo pr comments reply")
```

---

## Backwards compatibility

- `azdo pr comments` with no subcommand: unaffected — `reply` is an additional subcommand.
- All existing `azdo pr` subcommands: unaffected — `comment-reply` is additive.
