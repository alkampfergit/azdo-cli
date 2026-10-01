# Tasks: `azdo pr reviewers list`

- [x] **T001** `src/types/pull-request.ts` — `ReviewerVoteState`, `Reviewer.voteState` / `hasDeclined`, `AzdoIdentityRefWithVote.hasDeclined?`.
- [x] **T002** `src/services/pr-client.ts` — `reviewerVoteState()`, extend `mapReviewer`.
- [x] **T003** `src/commands/pr.ts` — `runReviewerList`, `formatReviewerLine`, register `pr reviewers list`.
- [x] **T004** `tests/unit/pr-client.test.ts` — vote table, defaults, existing expectations.
- [x] **T005** `tests/unit/pr-command-tree.test.ts` — command-tree coverage for `list`.
- [x] **T006** [P] `docs/commands.md` — command, vote table, JSON row, scope note.
- [x] **T007** [P] `docs/changelogs/unreleased.md`, `AGENTS.md` — entries.
- [x] **T008** Run `npm test && npm run lint`.
