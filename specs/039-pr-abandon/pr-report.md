# PR Report: `azdo pr abandon` and `azdo pr reactivate`

**Branch**: `feature/039-pr-abandon`
**Date**: 2026-09-16
**Spec**: [specs/039-pr-abandon/spec.md](./spec.md)

## Summary

The CLI could open a pull request and rewrite it, but never end one — an
accidentally-created PR was permanent as far as `azdo` was concerned, which is
what turned a recoverable mistake into a dead end in #92. This adds
`azdo pr abandon` (alias `azdo pr close`) and `azdo pr reactivate`, mapping to
the documented `PATCH .../pullrequests/{id}` with `{"status":"abandoned"}` /
`{"status":"active"}`.

## What's New

- **`src/commands/pr.ts` — `azdo pr abandon` / `azdo pr reactivate`**: two
  subcommands, not one command with a `--reactivate` flag (Principle III), over a
  single `runPrStatusChange(options, direction)` runner whose per-direction
  differences all live in one `PR_STATUS_CHANGES` table.
- **`resolvePullRequestTarget(options, { branchStatus })`**: the branch lookup is
  now status-aware. `reactivate` searches **abandoned** PRs — its target is by
  definition not active, so the previous active-only search would never have
  found one — with its own zero/multi-match wording. The default stays `'active'`,
  so every existing caller and the pinned 019 C-2/C-3 strings are untouched.
- **`src/types/pull-request.ts`**: `PullRequestLifecycleStatus` (`active` |
  `abandoned` — `completed` is deliberately absent), `status?` on
  `PullRequestUpdateRequest`, and `PullRequestStatusChangeResult`.

## Design Notes

- **No new client function.** Azure DevOps lists Status, Title and Description as
  members of one updatable set on one endpoint, so the status change rides
  `updatePullRequest()` from 038, which already sends exactly the keys it is
  given. The body is `{"status":"…"}` and nothing else.
- **A completed PR is refused client-side** (exit 1, no write) using the status
  the target resolution already fetched, so the refusal costs no extra call. The
  check runs *before* the no-op test, so a completed PR can never be reported as
  "already abandoned". A rejection the check does not predict still reaches the
  operator with the server's own message via the 037 surfacing.
- **No confirmation prompt, ever** — under a TTY or not. Abandoning is reversible
  by `reactivate` and nothing is deleted, so the prompt would buy nothing and
  would break every scripted caller.
- **The `close` alias** is the Azure DevOps documentation's own verb for abandon
  ("Abandon: Close the PR") and what `gh` users reach for. Its help text states
  explicitly that it does not complete or merge.

## Out of Scope

Completing / merging a PR (`status: "completed"`, completion options, squash,
auto-complete) — irreversible and with a policy-bypass surface, it deserves its
own spec. Also out: `isDraft`, labels, retargeting, and any cascading action on
abandon (deleting the source branch, unlinking work items).

## Tests

- `tests/unit/pr-abandon.test.ts` (new, 18 tests): status-only payload both
  directions, no-op both directions, completed refusal both directions, the
  per-direction branch search and its messages, `--json` shape, invalid
  `--pr-number`, not-found exit 3, permission exit 4, and the no-prompt guarantee.
- `tests/unit/pr-client.test.ts`: `updatePullRequest` with a status-only body.
- `tests/unit/pr-command-tree.test.ts`: `abandon` / `close` / `reactivate` driven
  through the real `azdo pr` tree — the only place option-plumbing bugs surface.

`npm test && npm run lint` green (1178 passed, 128 skipped; 0 lint errors).

## Docs

`docs/commands.md` — cheat-sheet lines and a full `pr abandon` / `pr reactivate`
block (no-op, completed refusal, no prompt, JSON shape), plus the `pr update`
note that used to defer status changes. `README.md` — the `pr` feature bullet and
four quick-start lines, matching the depth of its sibling `pr` commands.
`docs/changelogs/unreleased.md` — an Added entry.
