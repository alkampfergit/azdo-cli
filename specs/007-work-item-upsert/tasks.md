# Tasks: Work Item Upsert

**Input**: Design documents from `/specs/007-work-item-upsert/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included. The feature spec defines explicit independent test criteria for each user story, and the design artifacts call for focused unit coverage in `tests/unit/task-document.test.ts`, `tests/unit/upsert.test.ts`, and `tests/unit/azdo-client.test.ts`.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the new command entry point and repository wiring for the feature

- [ ] T001 Create the `upsert` command entry module in `src/commands/upsert.ts` and register it in `src/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types and helpers that every user story depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T002 Extend shared upsert and write-result interfaces in `src/types/work-item.ts`
- [ ] T003 [P] Add reusable source-validation and create-error handling helpers in `src/services/command-helpers.ts`
- [ ] T004 [P] Create task-document parser scaffolding, alias constants, and exported parser helpers in `src/services/task-document.ts`

**Checkpoint**: The command has a registered entry point, shared types exist, and parser/error helper scaffolding is ready for story work.

---

## Phase 3: User Story 1 - Create or Update a Task from One Markdown Payload (Priority: P1) 🎯 MVP

**Goal**: Users can create a new Task or update an existing Task from one inline markdown payload.

**Independent Test**: Run `azdo upsert --content <doc>` to create a Task and `azdo upsert <id> --content <doc>` to update it, verifying that declared scalar fields are applied and the command reports the resulting task ID.

### Implementation for User Story 1

- [ ] T005 [P] [US1] Implement inline front-matter parsing, canonical field normalization for friendly names and raw Azure DevOps reference names, duplicate-field detection, actionable malformed or unmappable validation errors, and scalar patch planning in `src/services/task-document.ts`
- [ ] T006 [P] [US1] Add Task create transport and normalized create/update write responses in `src/services/azdo-client.ts`
- [ ] T007 [US1] Implement the `azdo upsert [id] --content <markdown>` create/update flow in `src/commands/upsert.ts`, including non-empty Title validation for creates, reuse of existing `resolvePat` and `resolveContext` behavior, actionable create/update error handling, success output, and `--json` output
- [ ] T008 [US1] Add inline create/update coverage in `tests/unit/upsert.test.ts` and create transport coverage in `tests/unit/azdo-client.test.ts`, including raw reference-name acceptance and existing auth/context resolution parity

**Checkpoint**: User Story 1 is independently functional. Inline payloads create and update Tasks with actionable success and error output.

---

## Phase 4: User Story 2 - Import a Task Definition from a File (Priority: P2)

**Goal**: Users can import a task-definition file from disk and have it deleted only after a successful upsert.

**Independent Test**: Run `azdo upsert --file ./task.md` and `azdo upsert <id> --file ./task.md`, verifying that successful imports delete the file and failed imports keep it on disk.

### Implementation for User Story 2

- [ ] T009 [US2] Add `--file` source loading, conflicting-source rejection, readable-file validation, and success-only file deletion in `src/commands/upsert.ts`
- [ ] T010 [US2] Add file-import success and failure coverage in `tests/unit/upsert.test.ts`

**Checkpoint**: User Story 2 is independently functional. File imports behave correctly on success and preserve the source file on errors.

---

## Phase 5: User Story 3 - Mix Simple Fields and Rich Text Fields in One Payload (Priority: P2)

**Goal**: Users can combine scalar fields and markdown-rich fields in one task-definition document and have both applied in a single operation.

**Independent Test**: Run `azdo upsert --content <doc>` with YAML front matter plus `## Description` and `## Acceptance Criteria` sections, verifying that scalar values are stored exactly and markdown sections are stored with markdown formatting and clear semantics.

### Implementation for User Story 3

- [ ] T011 [P] [US3] Extend `src/services/task-document.ts` to parse `##` markdown sections, normalize rich-text aliases, and emit `/multilineFieldsFormat/<field>` operations for markdown fields
- [ ] T012 [US3] Implement mixed scalar-plus-markdown application and explicit clear semantics in `src/commands/upsert.ts`
- [ ] T013 [US3] Add mixed-document parsing and actionable invalid-input coverage in `tests/unit/task-document.test.ts` and `tests/unit/upsert.test.ts`, including malformed front matter, unknown friendly names, unmappable reference-name errors, duplicate fields, and clear semantics

**Checkpoint**: User Story 3 is independently functional. One document can update scalar fields and rich-text fields together with explicit clear behavior.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, validation, and regression safety across all stories

- [ ] T014 Update `README.md` with `azdo upsert` usage, document format rules, and file cleanup behavior
- [ ] T015 Validate and, if needed, align the workflow examples in `specs/007-work-item-upsert/quickstart.md` and `README.md`
- [ ] T016 Run constitution-aligned regression validation for `package.json`, `tests/unit/upsert.test.ts`, `tests/unit/task-document.test.ts`, and `tests/unit/azdo-client.test.ts` with `npm run build && npm run typecheck && npm test && npm run lint`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; starts immediately.
- **Foundational (Phase 2)**: Depends on Setup and blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational completion.
- **User Story 2 (Phase 4)**: Depends on User Story 1 because it extends the same `src/commands/upsert.ts` flow with file-source behavior.
- **User Story 3 (Phase 5)**: Depends on User Story 1 because it extends the same parser and command flow with markdown-section handling.
- **Polish (Phase 6)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **US1 (P1)**: No dependency on other user stories after Foundational.
- **US2 (P2)**: Builds on the core command introduced in US1.
- **US3 (P2)**: Builds on the parser and command flow introduced in US1.

### Within Each User Story

- Parser and transport tasks come before command wiring.
- Command wiring comes before test validation.
- Story-specific behavior must be complete before moving to the next story that modifies the same files.

### Parallel Opportunities

- `T003` and `T004` can run in parallel after `T002` because they touch different shared files.
- `T005` and `T006` can run in parallel for US1 because they touch `src/services/task-document.ts` and `src/services/azdo-client.ts` independently.
- `T011` can begin once US1 is complete, in parallel with documentation work that does not touch `src/commands/upsert.ts`.

---

## Parallel Example: User Story 1

```bash
# After T002 completes, build the US1 service layer in parallel:
Task: "Implement inline front-matter parsing, canonical field normalization, duplicate-field detection, and scalar patch planning in src/services/task-document.ts"
Task: "Add Task create transport and normalized create/update write responses in src/services/azdo-client.ts"

# Then wire the command and validate it:
Task: "Implement the azdo upsert [id] --content <markdown> create/update flow, success output, and --json output in src/commands/upsert.ts"
Task: "Add inline create/update coverage in tests/unit/upsert.test.ts and create transport coverage in tests/unit/azdo-client.test.ts"
```

---

## Parallel Example: Foundational Phase

```bash
# After T002 completes, both shared helper streams can proceed together:
Task: "Add reusable source-validation and create-error handling helpers in src/services/command-helpers.ts"
Task: "Create task-document parser scaffolding, alias constants, and exported parser helpers in src/services/task-document.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: User Story 1.
4. Stop and validate the inline create/update flow independently.
5. Demo or ship the MVP if only inline payload support is required initially.

### Incremental Delivery

1. Setup + Foundational establishes the shared command/parser/client foundation.
2. Add US1 for core inline upsert create/update.
3. Add US2 for file-based imports with cleanup semantics.
4. Add US3 for mixed scalar and markdown-rich documents.
5. Finish with docs and regression validation.

### Parallel Team Strategy

1. One developer completes Setup + Foundational.
2. After Foundational, service work for US1 can split between parser and transport.
3. After US1 lands, one developer can extend file handling while another prepares markdown-section parser changes, then merge sequentially through `src/commands/upsert.ts`.

---

## Notes

- All tasks follow the required checklist format with task IDs, optional `[P]` markers, story labels for story phases, and exact file paths.
- `src/commands/upsert.ts` is the highest-conflict file, so US2 and US3 should merge sequentially even if some preparatory work happens in parallel.
- The preferred validation closeout for this repo is `npm run build && npm run typecheck && npm test && npm run lint`.