# Tasks: Explicit install command in the update notice

- [x] **T001** `tests/unit/update-check.test.ts` — C4 asserts the new clause and
  the absence of `npm i -g` (fails before T002).
- [x] **T002** `src/services/update-check.ts` — update the notice string.
- [x] **T003** [P] `docs/commands.md` — update the *Update notifications* sample.
- [x] **T004** [P] `docs/changelogs/unreleased.md` — record under *Changed*.
- [x] **T005** Run `npm test && npm run lint`.
