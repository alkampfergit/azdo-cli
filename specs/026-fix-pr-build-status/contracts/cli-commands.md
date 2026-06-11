# CLI Contract: 026-fix-pr-build-status (issue #56)

Defines the observable command surface after this fix. All existing options and output format are preserved; changes are additive.

---

## `azdo pr status`

### Options (unchanged)

`--org <org>`, `--project <project>`, `--json`

### Behaviour changes

**Checks (FR-001, FR-002).** The `Checks:` section now lists the union of THREE sources:

1. Pull Request **statuses** (existing `/statuses` source)
2. Branch **policy evaluations** (existing `policy/evaluations` source)
3. **Pipeline runs** on the PR merge ref (new `build/builds?branchName=refs/pull/{prId}/merge` source)

Deduplication: if a policy evaluation links to a specific build ID (`context.buildId`), that build is excluded from the third source — the policy entry takes precedence.

**Required vs optional (FR-005).** Checks where `isBlocking === false` (from policy source) are suffixed `[optional]` in human output. All other checks (including build-source checks) carry no tag.

### Human output format

```
Checks:
- [succeeded] Build/CI build validation
- [failed] Security scan [optional]
- [pending] Integration tests
Code comments: 2 open, 1 closed
```

- Output is otherwise byte-for-byte identical to the existing format.
- `Checks: none reported by Azure DevOps` still appears when all three sources succeed but return empty.
- `Checks: unable to retrieve (Azure DevOps request failed)` still appears when all three sources fail AND no checks were collected.

### JSON output (`--json`) — additive changes

Each check object gains:

```jsonc
{
  "id": 42,
  "state": "succeeded",
  "name": "Build/CI build validation",
  "source": "build",        // new value 'build' alongside existing 'status' | 'policy'
  "isBlocking": null,       // null = unknown (build source); true/false from policy source
  ...
}
```

`isBlocking` is always present (never absent) in the JSON output for each check; `null` for build-source checks, `true`/`false` for policy-source checks, `null` for status-source checks.

---

## Non-goals (explicit)

- No new CLI flags or subcommands.
- No changes to `pr comments`, `pr comment-resolve`, `pr comment-reopen`, `pr open`, `pipeline *` commands.
- No version bump / release as part of this feature.
- No change to the `pr status` text format for PRs with no checks or PRs with only policy/status checks (exact backward compatibility).
