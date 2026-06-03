# CLI Contract: 023-pr-comments-status (issue #50)

Defines the observable command surface after this feature. Existing options
unchanged unless noted.

---

## `azdo pr status`

Check pull requests for the current branch, with **complete** check
information and code-comment counts.

### Options (unchanged)
- `--org <org>`, `--project <project>`, `--json`

### Behaviour changes

**Checks (FR-001, FR-002).** The `Checks:` section now lists the union of:
1. Pull Request **statuses** (existing `/statuses` source), and
2. Branch **policy evaluations** (new `policy/evaluations` source).

- When the union is non-empty: list every check as `- [<state>] <name>`.
- When the union is empty **and** both fetches succeeded: print
  `Checks: none reported by Azure DevOps`.
- When a fetch **fails**: print a distinct line indicating checks could not
  be retrieved (NOT "none"), e.g. `Checks: unable to retrieve (<reason>)`.

**Code-comment counts (FR-007, FR-008).** A new line per PR, e.g.:

```
Code comments: 2 open, 5 closed
```

Counts code-anchored threads only (general threads excluded). Zero when no
code-anchored threads exist.

### Human output (example)

```
Pull requests for branch feature/x in repo myrepo:

#123 [active] Add widget
feature/x -> develop
https://dev.azure.com/org/proj/_git/myrepo/pullrequest/123
Checks:
- [succeeded] Build/CI build validation
- [succeeded] Required reviewers
Code comments: 1 open, 3 closed
```

### JSON output (`--json`) — additive

Each pull request object gains:

```jsonc
{
  "id": 123,
  "title": "Add widget",
  "checks": [
    { "id": 1, "state": "succeeded", "name": "Build/CI build validation", "source": "policy" }
  ],
  "codeCommentCounts": { "open": 1, "closed": 3 }
}
```

Existing fields are preserved; only `checks[].source` and
`codeCommentCounts` are added.

---

## `azdo pr comments`

List comment threads for a pull request, with two new opt-in filters.

### Options

| Flag | Status | Meaning |
|------|--------|---------|
| `--org`, `--project`, `--pr-number <N>`, `--json` | unchanged | — |
| `--hide-resolved` | **retained (alias)** | Hide resolved/won't-fix/closed/by-design threads. |
| `--exclude-resolved` | **NEW** | Alias of `--hide-resolved` — identical effect. |
| `--code-related-only` | **NEW** | Show only threads anchored to a file/line; omit general threads. |

### Behaviour

- `--code-related-only` keeps threads where `threadContext !== null`.
- `--exclude-resolved` / `--hide-resolved` keep threads where
  `isThreadResolved(status)` is false.
- The two filters are **independent and combinable**; with both, only
  unresolved code-anchored threads are shown.
- **Default (no new flag): output is byte-for-byte unchanged** from the
  prior release (FR-006, SC-005).
- The filtered set is reflected in `--json` output as well (FR-010).

### Filtered-to-empty messages

When a filter removes all threads (but threads existed), print an
informative line rather than nothing, consistent with the existing
`--hide-resolved` empty message, e.g.:

```
No code-related comment threads for pull request #123.
```
```
No unresolved comment threads for pull request #123.
```

(When both filters applied and nothing remains, the message names the
combined filter.)

---

## Non-goals (explicit)

- No new external service or provider; only an additional ADO REST endpoint
  (`policy/evaluations`) and the Projects API for the project GUID.
- No change to `pr comment`, `pr comment-resolve`, `pr comment-reopen`.
- No version bump / release as part of this feature.
