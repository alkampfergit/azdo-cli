# Tasks: 038-pr-update

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [contracts/pr-update.md](./contracts/pr-update.md)
**Gate**: `npm test && npm run lint` must pass before the PR is marked ready.

`[P]` = can run in parallel with the other `[P]` tasks in the same phase.

## Phase 1 — transport (US-1, US-2)

- [X] **T001** `src/types/pull-request.ts`: add `PullRequestUpdateRequest` and `PullRequestUpdateResult` (contract C-5).
- [X] **T002** `src/services/pr-client.ts`: add `updatePullRequest()` — `PATCH .../pullrequests/{id}?api-version=7.1` (C-1), partial body, `DESCRIPTION_TOO_LONG` pre-flight against `MAX_PR_DESCRIPTION_CHARS`, response mapped through `mapPullRequest`.

## Phase 2 — shared input resolution (depends on Phase 1)

- [X] **T003** `src/commands/pr.ts`: teach `resolveCommentBody` that `file === '-'` means standard input (C-7), with `Cannot read standard input.` on failure.
- [X] **T004** `src/commands/pr.ts`: add `resolveOptionalTextInput(inline, file, label)` — `undefined` when neither is given, `null` when rejected, trimmed string otherwise; emits the C-3 mutual-exclusion and empty-value messages.

## Phase 3 — `pr update` (US-1, US-2, US-4)

- [X] **T005** `src/commands/pr.ts`: `createPrUpdateCommand()` with `--pr-number`, `--title`, `--title-file`, `--description`, `--description-file`, `--json` and the common `--org/--project/--repo`; validation per C-3 including the double-stdin guard.
- [X] **T006** `src/commands/pr.ts`: no-op detection against the already-fetched `BranchPullRequestMatch` — no PATCH, exit 0, `noop: true` (FR-008, C-4, C-5).
- [X] **T007** `src/commands/pr.ts`: human + `--json` reporting (C-4, C-5) and `DESCRIPTION_TOO_LONG` peeled off as a validation failure before `handlePrCommandError(..., 'write')`.
- [X] **T008** `src/commands/pr.ts`: register `update` (alias `edit`) on `createPrCommand()`.

## Phase 4 — `pr open --description-file` (US-3)

- [X] **T009** `src/commands/pr.ts`: add `--description-file <path>` to `createPrOpenCommand()`, mutually exclusive with `--description`, resolved through T004; template composition downstream unchanged (FR-010).

## Phase 5 — tests

- [X] **T010 [P]** `tests/unit/pr-update.test.ts` (new): validation, mutual exclusion, partial patch, no-op, stdin, not-found exit 3, over-length exit 1, `--json` shape.
- [X] **T011 [P]** `tests/unit/pr-open.test.ts`: `--description-file`, `--description-file -`, mutual exclusion with `--description`, missing file.
- [X] **T012 [P]** `tests/unit/pr-client.test.ts`: `updatePullRequest` URL, method, partial payload, over-length rejection.
- [X] **T013 [P]** `tests/unit/pr-command-tree.test.ts`: `azdo pr update` and `azdo pr edit` through the real command tree.

## Phase 6 — docs

- [X] **T014** `docs/commands.md`: cheat-sheet lines, the `azdo pr update` block (flags, literal replacement, no-op, JSON), the `--description-file` note on `pr open`, and the `-`/stdin note on the comment commands.
- [X] **T015** `CLAUDE.md` Recent Changes entry, and `README.md` reviewed and
  updated per Constitution (feature list + quick-start: `pr update` / `pr edit`,
  `--description-file` on `pr open`, and `-` for standard input).

## Phase 7 — gate

- [X] **T016** `npm test && npm run lint` green.
