# CLI Contract: 028-pr-comment-line (issue #61)

Defines the observable command surface after this feature. Existing options
and all other commands are unchanged.

---

## `azdo pr comments`

### Options (all unchanged)

`--org`, `--project`, `--pr-number <N>`, `--json`,
`--hide-resolved`, `--exclude-resolved`, `--code-related-only`

### Behaviour changes

**Thread header line (FR-001, FR-002, FR-003).**
For code-anchored threads, the header line gains a `:N` suffix when a line
position is available from the API:

```
Thread #<id> [<status>] <filePath>:<line>
```

When no line position is available:

```
Thread #<id> [<status>] <filePath>
```

General threads (no file anchor) are byte-for-byte unchanged:

```
Thread #<id> [<status>] (general)
```

### Human output (example, with line data present)

```
Comment threads for pull request #4674: My PR title

Thread #69293 [active] /src/Intranet/Search/OmniSearchIndexerPipeline.cs:42
  Gian Maria Ricci: Should we cache this result?

Thread #69294 [resolved] /src/Shared/Utils.cs:17
  Alice: Fixed in the last commit.
```

### JSON output (`--json`) — additive

Each thread object gains a `line` field. All existing fields are preserved.

```jsonc
{
  "branch": "feature/x",
  "pullRequest": { /* unchanged */ },
  "threads": [
    {
      "id": 69293,
      "status": "active",
      "threadContext": "/src/Intranet/Search/OmniSearchIndexerPipeline.cs",
      "line": 42,          // NEW — positive integer or null
      "comments": [ /* unchanged */ ]
    },
    {
      "id": 69294,
      "status": "active",
      "threadContext": null,   // general thread
      "line": null,            // NEW — always null for general threads
      "comments": [ /* unchanged */ ]
    }
  ]
}
```

### Backward compatibility

- **Default (no flags)**: output is identical to the prior release for any PR
  where the ADO API does not return position data. For PRs that do, the only
  difference is the `:N` suffix on code-anchored thread headers.
- **`--json` consumers**: the `line` field is additive. Consumers that do not
  read `line` are unaffected. `threadContext` remains a `string | null`.

### Non-goals (explicit)

- No change to `pr status`, `pr comment-resolve`, `pr comment-reopen`, or any
  other command.
- Column (`offset`) is not exposed.
- No new flags added in this feature.
