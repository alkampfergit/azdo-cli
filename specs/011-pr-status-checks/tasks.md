# Tasks: Pull Request Status Checks

**Input**: Design documents from `/specs/011-pr-status-checks/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Included. The feature needs unit coverage for Azure DevOps PR status-check mapping plus `pr status` text and JSON output.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this belongs to
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Define the shared pull request check result shapes

- [x] T001 Extend `src/types/pull-request.ts` with `PullRequestCheck` plus a status-command pull request shape that carries `checks`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add Azure DevOps pull request status-check transport used by all stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 [P] Add failing coverage in `tests/unit/pr-client.test.ts` for pull request status-check retrieval, filtering, and fallback naming
- [x] T003 Implement pull request status-check fetch and mapping in `src/services/pr-client.ts`

**Checkpoint**: The PR client can return pull requests enriched with check data.

---

## Phase 3: User Story 1 - Review PR Checks with Branch Status (Priority: P1) 🎯 MVP

**Goal**: Users can review Azure DevOps pull request checks directly in `azdo pr status`.

**Independent Test**: Run `azdo pr status` against mocked pull requests with checks and verify readable per-PR output.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T004 [P] [US1] Extend `tests/unit/pr-status.test.ts` for text output with checks and the empty-check message

### Implementation for User Story 1

- [x] T005 [US1] Update `src/commands/pr.ts` to render checks underneath each pull request in text mode

**Checkpoint**: `azdo pr status` prints checks in human-readable output.

---

## Phase 4: User Story 2 - Surface Error Details for Failed Checks (Priority: P2)

**Goal**: Users can see why a check failed or errored when Azure DevOps provides detail text.

**Independent Test**: Run `azdo pr status` against mocked failed/error checks and verify `Detail:` lines appear only when description text exists.

### Tests for User Story 2 ⚠️

- [x] T006 [P] [US2] Extend `tests/unit/pr-status.test.ts` for failed/error detail rendering

### Implementation for User Story 2

- [x] T007 [US2] Update `src/commands/pr.ts` formatting to include error detail from status descriptions

**Checkpoint**: Failed or errored checks include description detail when available.

---

## Phase 5: User Story 3 - Consume Check Data in Automation (Priority: P2)

**Goal**: Automation can consume check states from `azdo pr status --json`.

**Independent Test**: Run `azdo pr status --json` against mocked pull requests with and without checks and verify a stable `checks` array on every PR.

### Tests for User Story 3 ⚠️

- [x] T008 [P] [US3] Extend `tests/unit/pr-status.test.ts` for JSON output with check arrays

### Implementation for User Story 3

- [x] T009 [US3] Ensure `src/services/pr-client.ts` and `src/commands/pr.ts` preserve the additive `checks` field in JSON output

**Checkpoint**: `azdo pr status --json` includes machine-readable check data.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and repo validation

- [x] T010 Update `README.md` to document `azdo pr status` check output and error detail behavior
- [x] T011 Run `npm test && npm run lint`

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup and blocks all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational
- **User Story 2 (Phase 4)**: Depends on User Story 1 formatting path
- **User Story 3 (Phase 5)**: Depends on Foundational and shared result shape
- **Polish (Phase 6)**: Depends on all desired stories

### User Story Dependencies

- **User Story 1 (P1)**: Starts after check transport exists
- **User Story 2 (P2)**: Reuses the text rendering path from US1
- **User Story 3 (P2)**: Reuses the shared check mapping and command result shape

### Parallel Opportunities

- `T002` can be written before `T003`.
- `T004`, `T006`, and `T008` can be prepared independently once the shared types are defined.

## Notes

- Keep the feature additive to the existing `pr status` contract.
- Do not introduce policy-evaluation support in this slice.
