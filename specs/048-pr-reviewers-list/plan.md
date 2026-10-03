# Implementation Plan: `azdo pr reviewers list`

**Branch**: `feature/048-pr-reviewers-list` | **Spec**: [spec.md](./spec.md)

## Summary

Add the read side of the `pr reviewers` group on top of the client function
that already exists, extend the mapped `Reviewer` with a named vote state and
the declined flag, and document the vote table.

## Technical Context

TypeScript 5.x strict, commander.js, native `fetch`, vitest. No new
dependencies. Azure DevOps endpoint (Principle VI — verified via Microsoft
Learn MCP, API 7.1):
`GET https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repo}/pullRequests/{id}/reviewers?api-version=7.1`
→ `{ count, value: IdentityRefWithVote[] }`; scope `vso.code`. Vote values:
10 approved, 5 approved with suggestions, 0 no vote, -5 waiting for author,
-10 rejected; 15 bypassed / not applicable (extension API docs).

## Constitution Check

- I CLI-first: new subcommand with `--json` — PASS.
- III Single responsibility: `list` is read-only; `add` / `remove` untouched;
  the vote table lives in the service — PASS.
- V Simplicity: reuses `getPullRequestReviewers()` and
  `resolvePullRequestTarget()`; no new module — PASS.
- VI API research: endpoint and schema fetched from Microsoft Learn — PASS.
- Docs in `docs/`; README quick start gains the `reviewers list` examples
  (Constitution: README reflects every completed spec) — PASS.

## Design

| File | Change |
|------|--------|
| `src/types/pull-request.ts` | `ReviewerVoteState` union; `Reviewer` gains `voteState` and `hasDeclined`; `AzdoIdentityRefWithVote` gains `hasDeclined?`. |
| `src/services/pr-client.ts` | exported `reviewerVoteState(vote)`; `mapReviewer` fills the two new fields. |
| `src/commands/pr.ts` | `PrReviewerListResult`, `formatReviewerLine()`, `runReviewerList()`; `list` registered first in `createPrReviewersCommand()` with the common options, `--pr-number`, `--json`; errors via `handlePrCommandError(err, context, 'read')`. |
| `tests/unit/pr-client.test.ts` | vote mapping (each value + unknown), URL, defaults for missing fields; existing `toEqual` expectations extended with the two new fields. |
| `tests/unit/pr-command-tree.test.ts` | `list` through the real `azdo pr` tree: `--pr-number`/`--repo`/`--json` plumbing, branch fallback, human lines, empty list, invalid number, 403 → exit 4. |
| `docs/commands.md` | group table, examples, command block with the vote table, scope note, JSON table row. |
| `docs/changelogs/unreleased.md`, `AGENTS.md` | entries. |

## Decisions

- Dedicated subcommand rather than enriching `pr list --json`: keeps the
  pinned `PullRequest` shape stable and matches the issue's third option;
  follow-up possible.
- Named states use Azure DevOps' own vocabulary in kebab-case
  (`waiting-for-author`, `no-vote`) rather than the issue's shorthand, and
  the raw `vote` is always emitted so nothing is lost.
- `hasDeclined` included (it is a review state a conversation-follower
  needs); `isFlagged`, `isContainer`, `votedFor` left out (YAGNI).
