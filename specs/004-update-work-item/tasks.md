# Tasks: Update Work Item

**Input**: Design documents from `/specs/004-update-work-item/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No new project setup needed. The project already exists with commander.js, TypeScript, vitest, and the `get-item` command pattern.

*No tasks in this phase - project is already initialized.*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the shared types and service function that all three commands depend on.

**CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T001 Add `JsonPatchOperation` and `UpdateResult` interfaces to `src/types/work-item.ts` per data-model.md
- [ ] T002 Add `updateWorkItem` function to `src/services/azdo-client.ts` that accepts `AzdoContext`, work item ID, PAT, field name, and `JsonPatchOperation[]`, sends PATCH request with `application/json-patch+json` content type, handles 200/400/401/403/404 status codes per research.md R-004, and returns `UpdateResult`

**Checkpoint**: Foundation ready - shared update infrastructure available for all commands

---

## Phase 3: User Story 1 - Change Work Item State (Priority: P1) MVP

**Goal**: Users can change a work item's state via `azdo set-state <id> <state>`

**Independent Test**: Run `azdo set-state <id> "Active"` against a real Azure DevOps work item and verify the state changes.

### Implementation for User Story 1

- [ ] T003 [US1] Create `createSetStateCommand` in `src/commands/set-state.ts`: commander.js command with `<id>` and `<state>` arguments, `--org`, `--project`, `--json` options. Resolve context (CLI flags > config > git remote), resolve PAT, build JSON Patch operation for `System.State`, call `updateWorkItem`, display human-readable confirmation or JSON output per contracts/cli-commands.md. Handle all error cases per shared error messages table.
- [ ] T004 [US1] Register `set-state` command in `src/index.ts` by importing `createSetStateCommand` and calling `program.addCommand()`

**Checkpoint**: User Story 1 fully functional - `azdo set-state` works end-to-end

---

## Phase 4: User Story 2 - Assign Work Item (Priority: P2)

**Goal**: Users can assign or unassign a work item via `azdo assign <id> <name>` or `azdo assign <id> --unassign`

**Independent Test**: Run `azdo assign <id> "User Name"` and verify assignment changes; run with `--unassign` and verify the field is cleared.

### Implementation for User Story 2

- [ ] T005 [US2] Create `createAssignCommand` in `src/commands/assign.ts`: commander.js command with `<id>` argument, optional `[name]` argument, `--unassign`, `--org`, `--project`, `--json` options. Validate that either `name` or `--unassign` is provided (but not both). For assign: build JSON Patch with value as the name string. For unassign: build JSON Patch with empty string value. Call `updateWorkItem`, display confirmation per contracts/cli-commands.md. Handle all error cases.
- [ ] T006 [US2] Register `assign` command in `src/index.ts` by importing `createAssignCommand` and calling `program.addCommand()`

**Checkpoint**: User Stories 1 AND 2 both work independently

---

## Phase 5: User Story 3 - Set Any Field (Priority: P3)

**Goal**: Users can update any work item field via `azdo set-field <id> <field> <value>`

**Independent Test**: Run `azdo set-field <id> System.Title "New Title"` and verify the title changes on Azure DevOps.

### Implementation for User Story 3

- [ ] T007 [US3] Create `createSetFieldCommand` in `src/commands/set-field.ts`: commander.js command with `<id>`, `<field>`, and `<value>` arguments, `--org`, `--project`, `--json` options. Build JSON Patch operation for the given field reference name. Call `updateWorkItem`, display confirmation per contracts/cli-commands.md. Handle all error cases.
- [ ] T008 [US3] Register `set-field` command in `src/index.ts` by importing `createSetFieldCommand` and calling `program.addCommand()`

**Checkpoint**: All three user stories fully functional and independently testable

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify everything works together and passes existing checks.

- [ ] T009 Run `npm test && npm run lint` to verify no regressions in existing tests and lint passes
- [ ] T010 Run quickstart.md validation: manually test all command examples from `specs/004-update-work-item/quickstart.md` against a real Azure DevOps instance

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies - can start immediately. BLOCKS all user stories.
- **User Stories (Phase 3-5)**: All depend on Phase 2 completion (T001, T002).
  - User stories can proceed in parallel or sequentially in priority order (P1 -> P2 -> P3).
- **Polish (Phase 6)**: Depends on all user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Depends only on Phase 2 (T001, T002). No dependencies on other stories.
- **User Story 2 (P2)**: Depends only on Phase 2 (T001, T002). No dependencies on other stories.
- **User Story 3 (P3)**: Depends only on Phase 2 (T001, T002). No dependencies on other stories.

### Within Each User Story

- Command implementation before registration in index.ts
- Each story modifies a different command file (no file conflicts between stories)

### Parallel Opportunities

- T001 and T002 are sequential (T002 depends on types from T001)
- After Phase 2: US1 (T003-T004), US2 (T005-T006), US3 (T007-T008) can all run in parallel since they touch different files
- Exception: T004, T006, T008 all modify `src/index.ts` - if running in parallel, these must be coordinated

---

## Parallel Example: All User Stories

```bash
# After Phase 2 completes, launch all three stories in parallel:
Task: "Create set-state command in src/commands/set-state.ts"    # US1
Task: "Create assign command in src/commands/assign.ts"          # US2
Task: "Create set-field command in src/commands/set-field.ts"    # US3

# Then register all commands in src/index.ts (sequential, same file):
Task: "Register set-state command in src/index.ts"
Task: "Register assign command in src/index.ts"
Task: "Register set-field command in src/index.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (T001-T002)
2. Complete Phase 3: User Story 1 (T003-T004)
3. **STOP and VALIDATE**: Test `azdo set-state` independently
4. Deploy/demo if ready

### Incremental Delivery

1. Complete Foundational (T001-T002) -> Shared infrastructure ready
2. Add User Story 1 (T003-T004) -> Test `set-state` -> Deploy (MVP!)
3. Add User Story 2 (T005-T006) -> Test `assign` -> Deploy
4. Add User Story 3 (T007-T008) -> Test `set-field` -> Deploy
5. Polish (T009-T010) -> Final validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- All three commands follow the same pattern as existing `get-item` command (see `src/commands/get-item.ts`)
- Context resolution logic (CLI flags > config > git remote) should be extracted or follow the same inline pattern as `get-item`
- Commit after each task or logical group
