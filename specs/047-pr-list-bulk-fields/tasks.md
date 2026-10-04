# Tasks: Bulk PR ↔ work item read in `azdo pr list`

- [x] **T001** `src/types/pull-request.ts` — new fields and types.
- [x] **T002** `src/services/pr-client.ts` — extend `mapPullRequest`; add `getPullRequestWorkItemIds()`.
- [x] **T003** `src/commands/pr.ts` — `--work-items`, bounded lookup, text output, `parseListOptions`.
- [x] **T004** [P] `tests/unit/pr-client.test.ts` — mapping + endpoint; update three shape fixtures.
- [x] **T005** [P] `tests/unit/pr-list.test.ts` — flag behaviour, order, concurrency cap, auth failure.
- [x] **T006** [P] `docs/commands.md`, `docs/changelogs/unreleased.md`, `AGENTS.md`, `README.md` (Constitution VII, Copilot review).
- [x] **T007** `npm test && npm run lint`.
