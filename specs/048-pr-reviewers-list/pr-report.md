# PR Report: `azdo pr reviewers list` — votes with reviewer identity

**Branch**: `feature/048-pr-reviewers-list`
**Date**: 2026-10-01
**Spec**: [specs/048-pr-reviewers-list/spec.md](./spec.md)

## Summary

`azdo pr reviewers list` exposes a pull request's reviewers together with how
they voted. `--json` returns, per reviewer, the stable identity (`id`,
`uniqueName`) next to the display name, `isRequired`, Azure DevOps' raw
`vote` and its named `voteState`, plus `hasDeclined` — the `azdo` counterpart
of `gh pr view --json reviews` that automata needs to follow a PR
conversation without keying on display names (issue #124). It is read-only,
needs **Code (Read)** only, and shares `--pr-number` / `--repo` / branch
auto-detection with every other `pr` subcommand.

## What's New

- **`src/types/pull-request.ts`**: `ReviewerVoteState` union; `Reviewer`
  gains `voteState` and `hasDeclined`; the API shape gains `hasDeclined?`.
- **`src/services/pr-client.ts`**: exported `reviewerVoteState()` — 10
  `approved`, 5 `approved-with-suggestions`, 0 `no-vote`, -5
  `waiting-for-author`, -10 `rejected`, 15 `bypassed`, anything else
  `unknown` (raw number kept on `vote`); `mapReviewer` fills the new fields.
  Endpoint and vote table verified on Microsoft Learn (API 7.1).
- **`src/commands/pr.ts`**: `runReviewerList()` on top of the existing
  `getPullRequestReviewers()` and `resolvePullRequestTarget()`; `list` is
  registered on the `pr reviewers` group with the common options,
  `--pr-number` and `--json`. Human view: one line per reviewer
  (`Alice <alice@example.com> — approved (required)`); empty list prints
  `No reviewers on pull request #N.`.
- **`docs/commands.md`**: group table, examples, command block with the vote
  table, scope note, JSON contract row.
- **`docs/changelogs/unreleased.md`**, **`AGENTS.md`**: entries.

## Testing

- **Unit (`tests/unit/pr-client.test.ts`)**: every documented vote value and
  an unknown one map to the right state with the number preserved; missing
  optional fields default to `null` / `false` / `0`; the request URL is
  pinned; existing reviewer expectations extended with the two new fields.
- **Unit (`tests/unit/pr-command-tree.test.ts`)**: drives `list` through the
  real `azdo pr` tree — `--pr-number` / `--repo` / `--json` plumbing, branch
  fallback when `--pr-number` is omitted, the human lines, the empty list in
  both views, an invalid `--pr-number` (exit 1, no API call) and a 403 on the
  read (exit 4, empty stdout).
- **Full suite**: 1423 passed / 129 skipped; `npm run lint` clean;
  `tsc --noEmit` clean; `npm run build` success.

## Notes

- `pr reviewers add|remove --json` are byte-for-byte unchanged: they project
  their own fields rather than the whole `Reviewer`.
- Not done, by design: `reviewers` inside `pr list` / `pr status` payloads
  (the pinned `PullRequest` shape stays stable; a follow-up can add it if a
  single call matters), vote casting, and group member expansion
  (`votedFor`).
- README: the quick start gains the `reviewers list` human/JSON examples.
