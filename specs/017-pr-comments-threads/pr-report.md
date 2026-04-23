# PR Report: Reliable access and management of PR comment threads

**Branch**: `017-pr-comments-threads`
**Date**: 2026-04-23
**Spec**: [specs/017-pr-comments-threads/spec.md](./spec.md)

## Summary

Fixes the `azdo pr comments` crash reported in #34, where the command failed
with `Cannot read properties of undefined (reading 'web')` (plus a libuv
async-handle assertion on Windows pwsh) and left operators unable to read PR
discussion from the CLI. The same iteration adds a `--pr-number <N>` flag so
any PR can be targeted without checking out its branch, a `--hide-resolved`
triage filter, a bracketed status indicator next to each thread title, and
two new subcommands — `azdo pr comment-resolve` and `azdo pr comment-reopen`
— that flip a thread's state on the backend with idempotent no-op semantics.

## What's New

- **`azdo pr comments` crash fix** — `AzdoPullRequest._links` is now typed
  as optional (and its nested `web.href` too); `mapPullRequest` optional-
  chains the dereference and `BranchPullRequestMatch.url` widens to
  `string | null`. The synchronous `process.exit(1)` in the error path is
  replaced with `process.exitCode = 1` + an explicit caller `return`, so
  stdout/stderr drain cleanly before Node exits — removing the libuv
  `async.c` assertion on Windows pwsh. Affected: `src/types/pull-request.ts`,
  `src/services/pr-client.ts`, `src/commands/pr.ts`.
- **Full thread-status visibility** — `mapThread` no longer drops non-
  `active`/`pending` threads. Every backend state flows through and the
  formatter renders a bracketed indicator next to each thread title
  (`[active]`, `[pending]`, `[resolved]` collapsed label for the settled
  states `fixed` / `wontFix` / `closed` / `byDesign`).
- **`--hide-resolved` flag on `pr comments`** — Filters out threads whose
  backend state is settled. Default (flag absent) still shows every thread.
- **`--pr-number <N>` flag on `pr comments`** — Targets any PR by numeric
  id, bypassing the current-branch lookup entirely. Invalid numbers and
  missing PRs fail cleanly with a non-zero exit, no crash. Backed by a new
  `getPullRequestById` helper in `src/services/pr-client.ts`.
- **`pr comment-resolve <threadId>` and `pr comment-reopen <threadId>`** —
  New subcommands that PATCH the Azure DevOps thread endpoint with
  `{ status: 'fixed' }` or `{ status: 'active' }`. Both commands reuse
  `--org` / `--project` / `--pr-number` / `--json` with `pr comments` and
  are idempotent: calling resolve on an already-settled thread (or reopen
  on an already-active thread) exits 0 with an "already in desired state"
  message and `noop:true` in the JSON payload, skipping the backend write.
- **`isThreadResolved` helper** — Shared classification used by both the
  `--hide-resolved` filter and the idempotent resolve/reopen short-circuit.
- **README + `docs/commands.md`** — Updated to document every new flag
  and subcommand (constitution §Development Workflow requirement).

## Breaking Changes

These are safer type declarations that match what the Azure DevOps backend
actually returns. In practice no current consumer is affected — the fields
were already being formatted as strings — but they are visible in the TS
types so callers of the service module get a compile-time heads-up:

- **`BranchPullRequestMatch.url`**: `string` → `string | null`. Null appears
  when the upstream PR response omits `_links.web.href`; the CLI renders
  this as `—`.
- **`ActiveCommentThread.status`**: widens from `"active" | "pending"` to
  the full backend enum (`"unknown" | "active" | "fixed" | "wontFix" | "closed" | "byDesign" | "pending"`). Previously the service silently
  filtered non-active threads out; consumers relying on that filtering
  should now either use `isThreadResolved(thread.status)` or apply their
  own predicate.

## Testing

- **Unit** — 461 tests pass locally. New suites cover: `mapPullRequest`
  tolerance for missing `_links`; `mapThread` status pass-through;
  `isThreadResolved` classification of every backend state; the bracketed
  status indicator and `--hide-resolved` filter; `getPullRequestById`
  happy-path, 401, 404 and tolerant mapping; `--pr-number` validation
  across invalid inputs (non-integer, negative, zero, float, leading
  space, leading sign, hex) plus happy-path and 404 error paths;
  `patchThreadStatus` PATCH request shape for both `fixed` and `active`
  plus error mapping; and command-level behaviour of `pr comment-resolve`
  / `pr comment-reopen` for every interesting branch (happy-path, every
  settled state for idempotency, already-active / already-pending for
  reopen, thread-not-on-PR). Added file: `tests/unit/pr-comment-state.test.ts`.
- **Integration** — `tests/integration/pull-requests.test.ts` now
  exercises the real `AZDO_PR_ID` end-to-end for the read path (covers
  the #34 regression against a live PR) and includes a self-healing
  round-trip that flips the first thread between settled and active and
  restores the original state via a `try/finally` best-effort revert.
  Tests also cover `getPullRequestById` happy-path + 404. All gated
  behind `SKIP_PR || !AZDO_PR_ID` so CI without credentials stays green.
- **Static** — `npm run lint`, `npx tsc --noEmit`, and `npm run build`
  (tsup) are all clean with zero warnings on HEAD.

## Notes

- **Closes #34.**
- **Out of scope in this iteration:** creating new comment threads from
  the CLI, replying / editing / deleting individual comments, rich-text
  parity with the web UI, and any change to CLI-driven transitions
  targeting non-`active`/`fixed` backend states — those remain visible in
  listings but `comment-resolve` / `comment-reopen` treat settled-but-not-
  `fixed` states as "already resolved" for idempotency.
- **No version bump, tag, or release** is part of this PR — gitflow
  release is owner-driven via the separate `release/*` flow.
- **T024 (manual walkthrough against the test Azure DevOps org)** is
  tracked in `tasks.md` and intentionally deferred to the owner, since it
  needs live test credentials. Everything else (T001–T023) is complete.
