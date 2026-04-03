# Tasks: Comments Markdown Support

**Input**: Design documents from `specs/013-comments-markdown/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/cli-commands.md

## Phase 1: User Story 1 — Add Markdown Comment (P1) 🎯 MVP

**Goal**: `azdo comments add <id> <text> --markdown` posts the comment with `format: "markdown"` to the Azure DevOps API.

**Independent Test**: Run unit tests for `comments add` with `--markdown`; verify `addWorkItemComment` is called with `format: 'markdown'`.

### Tests for User Story 1

- [ ] T001 [P] [US1] Add `--markdown` tests to `tests/unit/comments-add.test.ts`:
  - When `--markdown` is passed, `addWorkItemComment` is called with `format: 'markdown'`
  - When `--markdown` is absent, `addWorkItemComment` is called with `format: 'html'` (or default)
  - Verify test FAILS before implementation

### Implementation for User Story 1

- [ ] T002 [US1] Extend `addWorkItemComment` in `src/services/azdo-client.ts`:
  - Add optional `format: 'html' | 'markdown'` parameter (default `'html'`)
  - Include `format` field in the POST request body JSON

- [ ] T003 [US1] Add `--markdown` option to `createCommentsAddCommand` in `src/commands/comments.ts`:
  - Add `markdown?: boolean` to `CommentCommandOptions` interface
  - Add `.option('--markdown', 'post comment as markdown')` to the `add` command
  - Pass `format: options.markdown ? 'markdown' : 'html'` to `addWorkItemComment`

**Checkpoint**: `comments add --markdown` posts with markdown format; existing behaviour unchanged.

---

## Phase 2: User Story 2 — List Comments with Markdown Conversion (P2)

**Goal**: `azdo comments list <id> --markdown` converts HTML comment bodies to markdown; non-HTML bodies are passed through unchanged. `--json` is never affected.

**Independent Test**: Run unit tests for `comments list` with `--markdown`; verify HTML text is converted and non-HTML text is unchanged.

### Tests for User Story 2

- [ ] T004 [P] [US2] Add `--markdown` tests to `tests/unit/comments-list.test.ts`:
  - When `--markdown` is passed and a comment body is HTML, the output contains converted markdown (no HTML tags)
  - When `--markdown` is passed and a comment body is plain text, the output is unchanged
  - When `--markdown` is absent, output is raw text (existing behaviour)
  - When both `--markdown` and `--json` are passed, JSON output is raw (no conversion)
  - Verify tests FAIL before implementation

### Implementation for User Story 2

- [ ] T005 [US2] Add `--markdown` option to `createCommentsListCommand` in `src/commands/comments.ts`:
  - Add `markdown?: boolean` to `CommentCommandOptions` interface (already added in T003 if shared, else add here)
  - Add `.option('--markdown', 'convert HTML comment bodies to markdown')` to the `list` command
  - In the action handler, when `options.markdown` is true and `options.json` is false, apply `toMarkdown()` to each comment's `text` field before formatting
  - Import `toMarkdown` from `../services/md-convert.js`

**Checkpoint**: `comments list --markdown` converts HTML; non-HTML unchanged; `--json` returns raw data.

---

## Phase 3: Polish

- [ ] T006 Run `npm test && npm run lint` and fix any failures
- [ ] T007 Commit all changes

---

## Dependencies & Execution Order

- T001 (tests, write & verify fail) → T002 (azdo-client) → T003 (command) → re-run T001 tests (verify pass)
- T004 (tests, write & verify fail) → T005 (command) → re-run T004 tests (verify pass)
- T006 after T005 completes
