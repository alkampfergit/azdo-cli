# Implementation Plan: `azdo pr abandon` and `azdo pr reactivate`

**Branch**: `feature/039-pr-abandon` | **Date**: 2026-09-16 | **Spec**: [spec.md](./spec.md)
**Input**: `specs/039-pr-abandon/spec.md`, GitHub issue #97

## Summary

Add one field to the existing `PATCH` body type (`status`), one status-aware
branch lookup, and two commands (`azdo pr abandon`, alias `close`, and
`azdo pr reactivate`) sharing a single `runPrStatusChange(direction)` runner.
Everything else is reuse: `updatePullRequest()` from 038, the target resolver,
the error handler, the exit-code contract and the `noop` convention.

## Technical Context

**Language/Version**: TypeScript 5.x (`strict: true`) on Node.js LTS (18+)
**Primary Dependencies**: commander.js, native `fetch` — **no new dependencies**
**Storage**: N/A (Azure DevOps REST only)
**Testing**: vitest (`tests/unit`)
**Target Platform**: Node CLI (Windows / macOS / Linux)
**Performance**: one GET (already issued for target resolution) + at most one PATCH

## Constitution Check

| Principle | Compliance |
| --- | --- |
| I. CLI-First | Two commander subcommands with `--json` and the group's exit codes (1 / 3 / 4). |
| II. TypeScript Strictness | `PullRequestLifecycleStatus` union + `PullRequestStatusChangeResult` in `src/types/pull-request.ts`; no `any`. |
| III. Single Responsibility | `abandon` and `reactivate` are separate commands, not one command with an inverting flag; completing a PR stays out. Shared logic is a private runner, not a public abstraction. |
| IV. npm Distribution | No new dependency, no build change. |
| V. Simplicity | One `status` key on the existing request type; no new client function; no prompt machinery. |
| VI. ADO API Research | [research.md](./research.md) — verified against Microsoft Learn MCP. |

No violations; no complexity-tracking entries.

## Design

### Types — `src/types/pull-request.ts`

```ts
// The two statuses this CLI writes. `completed` is deliberately absent:
// completing a PR is irreversible and out of scope (spec Out of Scope).
export type PullRequestLifecycleStatus = 'active' | 'abandoned';

export interface PullRequestUpdateRequest {
  title?: string;
  description?: string;
  status?: PullRequestLifecycleStatus;   // NEW
}

export interface PullRequestStatusChangeResult {
  pullRequestId: number;
  title: string;
  status: string;
  previousStatus: string;
  url: string | null;
  noop: boolean;
}
```

`status` joins the request type rather than getting its own client function:
the docs list Status, Title and Description as members of one updatable set on
one endpoint, and `updatePullRequest()` already sends exactly the keys it is
given (NFR-002).

### Transport — `src/services/pr-client.ts`

Unchanged code, widened contract: `updatePullRequest(context, repo, cred, prId,
{ status })` issues `PATCH … {"status":"abandoned"}`. The `DESCRIPTION_TOO_LONG`
pre-flight only inspects `fields.description`, so a status-only call skips it.

### Command — `src/commands/pr.ts`

`resolvePullRequestTarget(options, opts?: { branchStatus })` gains one optional
argument. Default `'active'` keeps every existing caller — and the pinned C-2/C-3
strings — byte-identical; `reactivate` passes `'abandoned'`, which switches both
the `listPullRequests` search criteria and the zero/multi-match wording to the
abandoned-specific strings (contract C-2).

`runPrStatusChange(options, direction: 'abandon' | 'reactivate')`:

1. `resolvePullRequestTarget(options, { branchStatus: direction === 'abandon' ? 'active' : 'abandoned' })`
   — owns `--pr-number` validation, the not-found exit 3 and the branch contract.
2. `current.status === 'completed'` → `writeError(...)`, exit 1, **no** PATCH
   (FR-007). Checked before the no-op test so a completed PR never reads as
   "already abandoned".
3. `current.status === target` → no-op result, exit 0, **no** PATCH (FR-006).
4. `updatePullRequest(..., { status: target })`, then report (C-5 / C-6).
5. `catch` → `handlePrCommandError(err, context, 'write')` — the 037 surfacing
   carries the server's own message for a rejection step 2 did not predict.

Registered on the `pr` tree as `abandon` (`.alias('close')`) and `reactivate`.
No top-level alias: neither is nested under another subcommand, so the commander
option-plumbing hazard that forced `comment-add` / `comment-edit` does not apply.
`mergedPrOptions` is still used, for consistency with the rest of the group.

## Testing strategy

| Suite | Covers |
| --- | --- |
| `tests/unit/pr-abandon.test.ts` (new) | status payload, no-op, completed refusal, branch lookup per direction, `--json`, exit codes, no prompt |
| `tests/unit/pr-client.test.ts` | `updatePullRequest` with a status-only body |
| `tests/unit/pr-command-tree.test.ts` | `azdo pr abandon` / `close` / `reactivate` through the real tree (option plumbing) |

Gate: `npm test && npm run lint`.

## Docs

`docs/commands.md` — the pull request section: two cheat-sheet lines and an
`azdo pr abandon` / `azdo pr reactivate` block (flags, no-op, completed refusal,
no prompt, JSON shape), plus a pointer from the `pr update` block, which
currently says status changes are "tracked separately". The repository has no
`docs/pr.md` (issue #97's wording) — the pull request documentation lives in
`docs/commands.md`, and per the `AGENTS.md` convention the flag-by-flag detail
belongs there.

`README.md` gets the quick-start surface only, at the depth its sibling `pr`
commands already have: the `pr` feature bullet names the two commands, and the
quick-start PR block gains three lines (`abandon`, `close`, `reactivate`).
Installation, the command-group table and the dev setup are unchanged.
