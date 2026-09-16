# Tasks: 039-pr-abandon

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [contracts/pr-abandon.md](./contracts/pr-abandon.md)
**Gate**: `npm test && npm run lint` must pass before the PR is marked ready.

`[P]` = can run in parallel with the other `[P]` tasks in the same phase.

## Phase 1 — types and transport (US-1, US-2)

- [X] **T001** `src/types/pull-request.ts`: add `PullRequestLifecycleStatus`, widen `PullRequestUpdateRequest` with `status?`, add `PullRequestStatusChangeResult` (contract C-6).
- [X] **T002** `src/services/pr-client.ts`: document that `updatePullRequest()` now also carries `status` (C-1); no behavioural change — the partial body already sends exactly the supplied keys.

## Phase 2 — target resolution (US-1, US-2)

- [X] **T003** `src/commands/pr.ts`: add the abandoned-specific zero/multi-match messages (C-2) next to the pinned 019 C-2/C-3 strings.
- [X] **T004** `src/commands/pr.ts`: `resolvePullRequestTarget(options, { branchStatus })` — default `'active'` keeps every existing caller byte-identical; `'abandoned'` switches both the search criteria and the wording.

## Phase 3 — the commands (US-1, US-2, US-3, US-4, US-5)

- [X] **T005** `src/commands/pr.ts`: `runPrStatusChange(options, direction)` — resolve, refuse a completed PR (FR-007, exit 1, no write), detect the no-op (FR-006, exit 0, no write), otherwise `updatePullRequest(..., { status })`.
- [X] **T006** `src/commands/pr.ts`: human + `--json` reporting per C-5 / C-6, and `handlePrCommandError(err, context, 'write')` for the server-side backstop.
- [X] **T007** `src/commands/pr.ts`: `createPrAbandonCommand()` (alias `close`, help text stating it is not "complete") and `createPrReactivateCommand()`; register both on `createPrCommand()`.

## Phase 4 — tests

- [X] **T008 [P]** `tests/unit/pr-abandon.test.ts` (new): status-only payload, no-op both directions, completed refusal both directions, branch lookup status per direction, `--json` shape, invalid `--pr-number`, not-found exit 3, no prompt.
- [X] **T009 [P]** `tests/unit/pr-client.test.ts`: `updatePullRequest` with a status-only body.
- [X] **T010 [P]** `tests/unit/pr-command-tree.test.ts`: `azdo pr abandon`, `azdo pr close`, `azdo pr reactivate` through the real command tree.

## Phase 5 — docs

- [X] **T011** `docs/commands.md`: cheat-sheet lines and the `azdo pr abandon` / `azdo pr reactivate` block; update the `pr update` note that currently defers status changes.
- [X] **T012** `README.md` (feature bullet + quick-start lines), `CLAUDE.md` Recent Changes, `AGENTS.md` Recent Changes.

## Phase 6 — gate

- [X] **T013** `npm test && npm run lint` green.
