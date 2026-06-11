# Data Model: Better support for commenting in the pull request (023)

**Feature**: 023-pr-comments-status · **Issue**: #50 · **Date**: 2026-06-03

All types live in `src/types/pull-request.ts` (raw Azure DevOps shapes) and
the domain shapes consumed by `src/commands/pr.ts`. This feature **extends**
existing types; it introduces no new storage.

---

## 1. PullRequestCheck (existing — extended)

The domain shape for a single check shown by `pr status`.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `number` | Existing. Status id or policy evaluation id. |
| `state` | `string` | Existing. Normalised state (e.g. `succeeded`, `failed`, `pending`, `error`). |
| `name` | `string` | Existing. Display name (genre/name for statuses; policy display name for policy evaluations). |
| `description` | `string \| null` | Existing. |
| `targetUrl` | `string \| null` | Existing. |
| `createdBy` | `string \| null` | Existing. |
| `createdAt` | `string \| null` | Existing. |
| `updatedAt` | `string \| null` | Existing. |
| `source` | `'status' \| 'policy'` | **NEW (optional).** Where the check came from, so the union is explainable. Defaults to `'status'` for the existing path. |

**State normalisation for policy evaluations.** Policy evaluation `status`
values (`approved`, `rejected`, `running`, `queued`, `notApplicable`, …) map
to the existing check states:

| Policy status | Mapped `state` |
|---------------|----------------|
| `approved` | `succeeded` |
| `rejected` | `failed` |
| `running` / `queued` | `pending` |
| `notApplicable` / `notSet` | dropped (consistent with `mapPullRequestCheck`) |

---

## 2. ActiveCommentThread (existing — unchanged)

Already carries the field needed for code-vs-general classification.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `number` | Existing. |
| `status` | `string` | Existing. Backend thread status; classified via `isThreadResolved`. |
| `threadContext` | `string \| null` | Existing. File path anchor, or `null` for a general thread. **This is the code-vs-general discriminator.** |
| `comments` | `ActivePullRequestComment[]` | Existing. |

Derived predicates (no new fields):
- **isCodeAnchored(thread)** ≡ `thread.threadContext !== null`.
- **isResolved(thread)** ≡ `isThreadResolved(thread.status)` (existing).

---

## 3. PullRequestStatusPullRequest / PullRequestStatusResult (existing — extended)

The per-PR block rendered by `pr status` gains comment counts.

| Field | Type | Notes |
|-------|------|-------|
| `id`, `title`, `status`, `sourceRefName`, `targetRefName`, `url` | — | Existing. |
| `checks` | `PullRequestCheck[]` | Existing (now the union of statuses + policy evaluations). |
| `codeCommentCounts` | `{ open: number; closed: number }` | **NEW.** Counts of code-anchored threads bucketed by resolved state. General threads excluded. |

`PullRequestStatusResult` is unchanged in shape (`branch`, `repository`,
`pullRequests[]`); each entry now includes `codeCommentCounts`.

---

## 4. CLI option shapes (commander.js)

`PrCommandOptions` (the comments command options object) gains two booleans:

| Option flag | Field | Default | Meaning |
|-------------|-------|---------|---------|
| `--code-related-only` | `codeRelatedOnly?: boolean` | `false` | Keep only threads with `threadContext !== null`. |
| `--exclude-resolved` (alias of existing `--hide-resolved`) | `hideResolved?: boolean` | `false` | Drop resolved threads (`isThreadResolved`). |

Both are opt-in; omitting both preserves current output (FR-006).

---

## Validation & invariants

- **INV-1**: `codeCommentCounts.open + codeCommentCounts.closed` = number of
  code-anchored threads on the PR (general threads never counted) — FR-008.
- **INV-2**: A thread is classified open/closed by exactly one predicate
  (`isThreadResolved`) everywhere (counts + `--exclude-resolved`) — FR-009.
- **INV-3**: With neither comments flag set, the rendered/serialised thread
  list is identical to pre-feature behaviour — FR-006, SC-005.
- **INV-4**: `pr status` shows "none reported" only when both the status and
  policy-evaluation collections are empty AND both fetches succeeded —
  FR-001, FR-002.
