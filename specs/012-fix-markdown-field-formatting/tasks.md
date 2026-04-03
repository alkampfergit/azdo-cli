# Tasks: Fix Markdown Field Formatting in Get Item Output

**Input**: Design documents from `/specs/012-fix-markdown-field-formatting/`
**Prerequisites**: plan.md, spec.md, research.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2)
- Exact file paths included in all descriptions

---

## Phase 1: Setup

**Purpose**: No new project setup needed — this is a targeted bug fix in an existing file.

- [X] T001 Verify current test suite passes by running `npm test` in `/workspaces/azdo-cli`

---

## Phase 2: User Story 1 - Single-Line Markdown Field Display (Priority: P1) MVP

**Goal**: When a markdown field value has no newlines, display it as `Label: value` on the same line.

**Independent Test**: Unit tests for `formatExtraFields` and `summarizeDescription` with single-line markdown values pass and output shows `: ` separator.

### Tests for User Story 1

- [X] T002 [US1] Add unit tests for single-line markdown extra field formatting in `tests/unit/get-item-markdown.test.ts` — test that `formatWorkItem` with a single-line extra field in markdown mode produces `FieldName: value` (colon-space separator)
- [X] T003 [US1] Add unit tests for single-line markdown description in short mode in `tests/unit/get-item-markdown.test.ts` — test that `formatWorkItem` with a single-line description in short+markdown mode produces `Description: <content>`

### Implementation for User Story 1

- [X] T004 [US1] Add helper function `formatMarkdownField(label: string, value: string): string` in `src/commands/get-item.ts` that returns `${label}: ${value}` for single-line values and `${label}:\n${value}` for multi-line values
- [X] T005 [US1] Update `formatExtraFields` in `src/commands/get-item.ts` to use `formatMarkdownField` when `markdown=true`, otherwise keep existing padEnd behavior
- [X] T006 [US1] Update `summarizeDescription` in `src/commands/get-item.ts` to use `formatMarkdownField` when formatting the description label+content, applying the same single-line vs multi-line rule

**Checkpoint**: User Story 1 complete — single-line markdown fields display with `: ` separator

---

## Phase 3: User Story 2 - Multi-Line Markdown Field Display (Priority: P2)

**Goal**: When a markdown field value contains newlines, display the label on one line and content on the next.

**Independent Test**: Unit tests for `formatExtraFields` and non-short description mode with multi-line markdown values pass and output shows label on its own line followed by content.

### Tests for User Story 2

- [X] T007 [US2] Add unit tests for multi-line markdown extra field formatting in `tests/unit/get-item-markdown.test.ts` — test that `formatWorkItem` with a multi-line HTML extra field in markdown mode produces `FieldName:\n<markdown content>` (label on own line, content on next)
- [X] T008 [US2] Add unit tests for multi-line markdown description in short mode in `tests/unit/get-item-markdown.test.ts` — test that a description that converts to multiple markdown lines starts on the line after `Description:`
- [X] T009 [US2] Add unit tests verifying non-markdown mode output is unchanged by the fix in `tests/unit/get-item-markdown.test.ts`

### Implementation for User Story 2

- [X] T010 [US2] Verify that the `formatMarkdownField` helper added in T004 correctly handles multi-line values (value contains `\n` → label on own line, content on next line) — this should already work from T004 but confirm with tests from T007/T008

**Checkpoint**: User Story 2 complete — multi-line markdown fields display label then content on next line

---

## Phase 4: Polish & Cross-Cutting Concerns

- [X] T011 Run `npm test && npm run lint` in `/workspaces/azdo-cli` and fix any failures
- [X] T012 Review `tests/unit/get-item-markdown.test.ts` to ensure existing tests still pass (backward compatibility for non-markdown mode)

---

## Dependencies & Execution Order

- **T001**: No dependencies — runs first to confirm baseline
- **T002, T003**: Write tests first (they should fail before T004-T006)
- **T004**: Implement helper — depends on T002, T003 to define expected behavior
- **T005, T006**: [P] Can run in parallel — different functions in same file, no cross-dependency
- **T007, T008, T009**: [P] Can run in parallel — all test tasks, different cases
- **T010**: Depends on T004 being complete
- **T011, T012**: Polish — depends on all implementation tasks complete

### User Story Dependencies

- **US1 (P1)**: No dependencies on US2
- **US2 (P2)**: Depends on T004 (helper function from US1) — specifically the multi-line branch

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. T001: Confirm baseline tests pass
2. T002, T003: Write failing tests for single-line case
3. T004: Implement `formatMarkdownField` helper
4. T005, T006: Wire helper into existing functions
5. Verify T002, T003 now pass
6. **STOP and VALIDATE**: Single-line formatting fixed

### Full Delivery

1. Complete MVP steps above
2. T007, T008, T009: Add multi-line tests (T007 may already pass from T004)
3. T010: Verify multi-line case works
4. T011, T012: Polish and lint

---

## Notes

- No new files to create — all changes are in existing files
- The `formatMarkdownField` helper is a pure function — easy to unit test in isolation
- Non-markdown mode uses `padEnd(13)` label formatting and MUST remain unchanged
- Commit after each phase checkpoint
