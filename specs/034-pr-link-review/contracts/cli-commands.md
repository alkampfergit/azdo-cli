# CLI command contracts — 034-pr-link-review

New commands live under the existing `azdo pr` parent
(`src/commands/pr.ts`), reusing `withCommonPrOptions` (`--org`,
`--project`, `--repo`) and the `--pr-number` resolution helper
(`resolvePullRequestTarget`) already used by `pr comment-resolve` /
`pr comments add`. Exit-code convention matches the rest of `pr`: **0**
on success (including idempotent no-ops), **1** validation / unresolved
identity or work item / unexpected error, **3** addressed resource not
found (existing `EXIT_NOT_FOUND`), **4** not permitted (existing
`EXIT_NOT_PERMITTED`).

## `azdo pr work-items link <workItemId>`

### Flags

| Flag | Required | Default | Behaviour |
| --- | --- | --- | --- |
| `--org`, `--project`, `--repo`, `--pr-number <N>` | no | branch-based PR resolution | same as every other `pr` write command |
| `--json` | no | false | emit `{ pullRequestId, workItemId, noop }` |

### Positional arguments

| Name | Type | Required | Behaviour |
| --- | --- | --- | --- |
| `workItemId` | positive integer | yes | id of the work item to link |

### Exit codes / errors

| Code | When |
| --- | --- |
| 0 | linked, or already linked (no-op, FR-005) |
| 1 | invalid `workItemId` |
| 3 | work item does not exist (FR-003) — `Work item #<id> not found in <org>/<project>.`; pull request not found |
| 4 | auth/permission failure |

### Output

- Human: `Linked work item #<id> to pull request #<N>.` or
  `Work item #<id> is already linked to pull request #<N>.`
- `--json`: `{ "pullRequestId": N, "workItemId": id, "noop": boolean }`

## `azdo pr work-items unlink <workItemId>`

Same flags/positional shape as `link`. `--json` emits the same result
shape.

### Exit codes / errors

| Code | When |
| --- | --- |
| 0 | unlinked, or was not linked (no-op, FR-004) |
| 1 | invalid `workItemId` |
| 3 | work item does not exist; pull request not found |
| 4 | auth/permission failure |

### Output

- Human: `Unlinked work item #<id> from pull request #<N>.` or
  `Work item #<id> was not linked to pull request #<N>.`

## `azdo pr reviewers add <reviewer>`

### Flags

| Flag | Required | Default | Behaviour |
| --- | --- | --- | --- |
| `--org`, `--project`, `--repo`, `--pr-number <N>` | no | branch-based PR resolution | same as above |
| `--required` | no | false | mark the reviewer required instead of optional (FR-007) |
| `--json` | no | false | emit `{ pullRequestId, reviewer: { id, displayName, uniqueName, isRequired }, noop }` |

### Positional arguments

| Name | Type | Required | Behaviour |
| --- | --- | --- | --- |
| `reviewer` | string | yes | email or unique name, resolved via the Identities API |

### Exit codes / errors

| Code | When |
| --- | --- |
| 0 | added, required/optional flag updated on an existing reviewer (FR-011), or already exactly as requested (no-op, `noop: true`) |
| 1 | reviewer identity cannot be resolved (FR-009) — `Reviewer "<input>" could not be resolved to an Azure DevOps identity.`; ambiguous (multiple matches) uses the same message |
| 3 | pull request not found |
| 4 | auth/permission failure |

### Output

- Human: `Added <displayName> as a required reviewer on pull request #<N>.`
  (or "optional reviewer"), or `<displayName> is already a required
  reviewer on pull request #<N>.` when no change was needed.

## `azdo pr reviewers remove <reviewer>`

Same flags/positional shape as `add` (no `--required` flag — removal is
unconditional). `--json` emits `{ pullRequestId, reviewer: { id,
displayName, uniqueName } | null, noop }` — `reviewer` is `null` when
the identity resolved but was never on the PR.

### Exit codes / errors

| Code | When |
| --- | --- |
| 0 | removed, or was not a reviewer (no-op, FR-010) |
| 1 | reviewer identity cannot be resolved |
| 3 | pull request not found |
| 4 | auth/permission failure |

### Output

- Human: `Removed <displayName> from pull request #<N>.` or `<input> is
  not a reviewer on pull request #<N>.`

## `azdo pr open` — existing command, behaviour change only

### Flag change

| Flag | Change |
| --- | --- |
| `--description <description>` | now **optional**. When omitted, the command searches for a repository-defined template (FR-012/FR-013) before falling back to today's error. |

No new flags; `--title` stays required.

### Behaviour

1. If `--description` is passed and no template matches → today's
   behaviour, unchanged.
2. If `--description` is passed and a template matches → the created
   description is `<description>\n\n<template content>` (FR-014).
3. If `--description` is omitted and a template matches → the created
   description is the template content verbatim (FR-012).
4. If `--description` is omitted and no template matches → today's
   `Error: --description is required for pull request creation.`,
   unchanged (FR-013's explicit "no fallback" case).

### Output

- `--json` result gains no new top-level field; `PullRequestOpenResult`
  already carries the created/existing PR's `description` — it now
  simply reflects whichever of the four cases above applied. Human
  output is unchanged (`Created pull request #<id>: <title>`).
