# Tasks: `azdo pr comments delete`

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

## Phase 1 — research

- [X] **T001** Confirm the DELETE route, response and scopes on Microsoft Learn (Constitution VI).

## Phase 2 — client

- [X] **T002** `src/services/pr-client.ts`: `deleteThreadComment()` — DELETE, no body parsed, `httpError` on non-ok.

## Phase 3 — command

- [X] **T003** `src/commands/pr.ts`: extract `parseExplicitCommentId` / `findCommentInThread` from `edit`; rename `fetchThreadForEdit` → `fetchTargetThread`.
- [X] **T004** `src/commands/pr.ts`: `selectDeletableComment`, `reportDeleteResult`, `runCommentDelete`, `buildCommentDeleteCommand`; register `comments delete` and `comment-delete`.

## Phase 4 — tests

- [X] **T005 [P]** `tests/unit/pr-comment-authoring.test.ts`: `pr comments delete` suite (16 tests).
- [X] **T006 [P]** `tests/unit/pr-client.test.ts`: `deleteThreadComment` (4 tests).
- [X] **T007 [P]** `tests/unit/pr-command-tree.test.ts`: nested vs alias plumbing (3 tests).

## Phase 5 — docs

- [X] **T008** `docs/commands.md`, `README.md` quick-start line, `docs/changelogs/unreleased.md`, `AGENTS.md` Recent Changes (the authoritative repository memory; `CLAUDE.md` is left untouched).

## Phase 6 — gate

- [X] **T009** `npm test && npm run lint` green.
