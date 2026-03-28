# Tasks: Work Item Create by Type

**Input**: Design documents from `/specs/009-work-item-create-type/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Included. The feature needs unit coverage for create-type option handling, backward-compatible Task defaults, invalid `--type` combinations, and result-shape reporting.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this belongs to
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Extend command inputs and result outputs for create-time type selection

- [ ] T001 Update `UpsertOptions` handling and shared upsert result typing in `src/commands/upsert.ts` and `src/types/work-item.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish common validation and result-shaping used by all stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T002 Add create-type validation helpers and result shaping in `src/commands/upsert.ts`

**Checkpoint**: `upsert` can distinguish create vs update and compute the resulting work item type for output.

---

## Phase 3: User Story 1 - Create a Specific Work Item Type (Priority: P1) 🎯 MVP

**Goal**: Users can create Bug, User Story, Feature, Epic, or other Azure DevOps work item types from the existing markdown document workflow.

**Independent Test**: Run `azdo upsert --type "User Story" --content <doc>` and verify that `createWorkItem()` receives `User Story` and the result reports that type.

### Implementation for User Story 1

- [ ] T003 [US1] Add `--type <work item type>` to `src/commands/upsert.ts` and pass the resolved create type into `createWorkItem()`
- [ ] T004 [US1] Add create-type coverage in `tests/unit/upsert.test.ts` for Bug, User Story, and JSON result reporting

**Checkpoint**: Create mode can target non-Task Azure DevOps work item types.

---

## Phase 4: User Story 2 - Preserve Existing Task Create Behavior (Priority: P2)

**Goal**: Existing `upsert` create flows keep creating Tasks when `--type` is omitted.

**Independent Test**: Run `azdo upsert --content <doc>` and verify that `createWorkItem()` is still called with `Task`.

### Implementation for User Story 2

- [ ] T005 [US2] Preserve and verify default Task behavior in `src/commands/upsert.ts`
- [ ] T006 [US2] Extend `tests/unit/upsert.test.ts` to cover default Task behavior and human-readable type-aware output

**Checkpoint**: No breaking change for existing Task-oriented callers.

---

## Phase 5: User Story 3 - Reject Ambiguous Type Usage (Priority: P2)

**Goal**: Invalid `--type` usage fails locally with actionable errors.

**Independent Test**: Run `azdo upsert 123 --type Bug --content <doc>` and verify that no write is attempted.

### Implementation for User Story 3

- [ ] T007 [US3] Reject update-mode `--type` usage and empty type values in `src/commands/upsert.ts`
- [ ] T008 [US3] Add rejection coverage in `tests/unit/upsert.test.ts`

**Checkpoint**: The command fails fast on invalid `--type` combinations.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and regression validation

- [ ] T009 Update `README.md` to document `azdo upsert --type <work item type>` and type-aware output
- [ ] T010 Run `npm run build && npm run typecheck && npm test && npm run lint`

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup
- **US1 (Phase 3)**: Depends on Foundational
- **US2 (Phase 4)**: Depends on US1 because it extends the same create path
- **US3 (Phase 5)**: Depends on US1 because it extends the same option-validation path
- **Polish (Phase 6)**: Depends on all desired stories

### Parallel Opportunities

- `T004` and `T006` can be merged into one test pass if preferred because they touch the same file.
- Documentation work can begin once the command contract is stable.
