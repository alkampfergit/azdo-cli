# Tasks: Work Item Comments

**Input**: Design documents from `/specs/010-work-item-comments/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Included. The feature needs unit coverage for work item comment pagination, deleted-comment filtering, command validation, human-readable rendering, and JSON output.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this belongs to
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Define the shared comment result types used by service and command layers

- [x] T001 Extend `src/types/work-item.ts` with `WorkItemComment`, `WorkItemCommentsResult`, and `AddWorkItemCommentResult`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the shared Azure DevOps work item comment transport used by all stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 [P] Add failing coverage in `tests/unit/azdo-client.test.ts` for paginated comment reads, deleted-comment filtering, and add-comment response mapping
- [x] T003 Implement comment URL builders, response mappers, `listWorkItemComments()`, and `addWorkItemComment()` in `src/services/azdo-client.ts`

**Checkpoint**: The work item client can read full visible comment history and create a new comment with stable mapped result objects.

---

## Phase 3: User Story 1 - Read Work Item Discussion History (Priority: P1) 🎯 MVP

**Goal**: Users can list a work item's visible comments from the terminal with useful human-readable output.

**Independent Test**: Run `azdo comments list <id>` against mocked comment history and verify newest-first rendered output, empty-state success, and read-path error handling.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T004 [P] [US1] Create `tests/unit/comments-list.test.ts` covering empty state, newest-first rendered comment blocks, and read-path error handling

### Implementation for User Story 1

- [x] T005 [US1] Add `createCommentsCommand()` and `createCommentsListCommand()` to `src/commands/comments.ts`
- [x] T006 [US1] Register `createCommentsCommand()` in `src/index.ts` and finish list formatting/output handling in `src/commands/comments.ts`

**Checkpoint**: `azdo comments list <id>` is fully functional and testable on its own.

---

## Phase 4: User Story 2 - Post a Progress Update Comment (Priority: P2)

**Goal**: Users can add a new work item comment from the CLI with local validation and clear success output.

**Independent Test**: Run `azdo comments add <id> "Progress update"` against mocked Azure DevOps responses and verify whitespace rejection, success output, and write-path error handling.

### Tests for User Story 2 ⚠️

- [x] T007 [P] [US2] Create `tests/unit/comments-add.test.ts` covering whitespace-only rejection, success output, and write-path error handling

### Implementation for User Story 2

- [x] T008 [US2] Extend `src/commands/comments.ts` with `createCommentsAddCommand()` and add-comment success formatting

**Checkpoint**: `azdo comments add <id> <text>` is fully functional and testable on its own.

---

## Phase 5: User Story 3 - Use Comments in Automation (Priority: P2)

**Goal**: Both comment commands return stable JSON output for scripts and agents.

**Independent Test**: Run `azdo comments list <id> --json` and `azdo comments add <id> "Update" --json` and verify both outputs match the documented contract shapes.

### Tests for User Story 3 ⚠️

- [x] T009 [P] [US3] Extend `tests/unit/comments-list.test.ts` and `tests/unit/comments-add.test.ts` with `--json` contract assertions

### Implementation for User Story 3

- [x] T010 [US3] Add stable JSON result writing for both comment subcommands in `src/commands/comments.ts`

**Checkpoint**: Both comment subcommands are automation-friendly and independently verifiable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and repo-level validation

- [x] T011 Update `README.md` to document `azdo comments list` and `azdo comments add` with examples and output notes
- [x] T012 Run `npm run build && npm run typecheck && npm test && npm run lint`

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup and blocks all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational
- **User Story 2 (Phase 4)**: Depends on Foundational and reuses the command group introduced in US1
- **User Story 3 (Phase 5)**: Depends on US1 and US2 because it extends both command flows
- **Polish (Phase 6)**: Depends on all desired stories

### User Story Dependencies

- **User Story 1 (P1)**: Can start as soon as the comment transport is complete
- **User Story 2 (P2)**: Can start after Foundational and after the command group file exists from US1
- **User Story 3 (P2)**: Depends on both existing command paths

### Parallel Opportunities

- `T002` can be written before `T003` because it defines the failing transport expectations.
- `T004` and `T007` can be prepared independently once the foundational transport is done.
- `T009` can be implemented after the human-readable command paths exist for both subcommands.

---

## Parallel Example: User Stories 1 and 2

```bash
Task: "Create tests/unit/comments-list.test.ts covering empty state, newest-first rendered comment blocks, and read-path error handling"
Task: "Create tests/unit/comments-add.test.ts covering whitespace-only rejection, success output, and write-path error handling"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. Validate `azdo comments list <id>` independently

### Incremental Delivery

1. Land shared comment transport and types
2. Add list command and validate history reading
3. Add add-comment command and validate posting
4. Add JSON output guarantees for automation
5. Update docs and run full quality gates

## Notes

- Keep the work item comments feature inside the existing work item service boundary.
- Follow TDD for each story-specific command task.
- Avoid adding edit/delete comment support in this feature slice.
