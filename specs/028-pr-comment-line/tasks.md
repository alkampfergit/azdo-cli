# Tasks: PR Comment Line Number Display

**Input**: Design documents from `specs/028-pr-comment-line/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/cli-commands.md ✅, quickstart.md ✅

**Organization**: Tasks are grouped by phase. Phase 2 (Foundational) delivers the type and mapper
changes that both user stories depend on. Phase 3 adds the human-readable formatter change (US1).
Phase 4 verifies JSON output (US2 — implementation is automatic once foundational changes land).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to

---

## Phase 1: Setup

**Purpose**: No new project infrastructure is needed — all files already exist. This phase
confirms the starting state.

- [ ] T001 Verify starting state: run `npm run lint && npm test && npm run build` from repo root and confirm all pass before any changes

---

## Phase 2: Foundational — Type Layer and Mapper

**Purpose**: Expand the ADO type and internal model to carry the line number. These changes block
both user stories.

**⚠️ CRITICAL**: US1 and US2 implementation cannot begin until this phase is complete.

- [ ] T002 Add `CommentPosition` interface (`{ line: number; offset: number }`) in `src/types/pull-request.ts` just before `AzdoThread`; do NOT export it (internal ADO detail)
- [ ] T003 Expand `AzdoThread.threadContext` in `src/types/pull-request.ts` to include `rightFileStart?: CommentPosition`, `rightFileEnd?: CommentPosition`, `leftFileStart?: CommentPosition`, `leftFileEnd?: CommentPosition` alongside the existing `filePath?: string`
- [ ] T004 Add `line: number | null` field to `ActiveCommentThread` in `src/types/pull-request.ts` after the `threadContext` field
- [ ] T005 Update `mapThread()` in `src/services/pr-client.ts`: extract `line = thread.threadContext?.rightFileStart?.line ?? thread.threadContext?.leftFileStart?.line ?? null` and include it in the returned object
- [ ] T006 Update `toActiveCommentThread()` in `src/services/pr-client.ts` with the same `line` extraction (mirrors T005)
- [ ] T007 [P] Update all `ActiveCommentThread` fixtures in `tests/unit/pr-client.test.ts` to add `line: null` (TypeScript strict mode will require it)
- [ ] T008 [P] Update all `ActiveCommentThread` fixtures in `tests/unit/pr-comments.test.ts` to add `line: null`
- [ ] T009 [P] Update all `ActiveCommentThread` fixtures in `tests/unit/pr-comments-filters.test.ts` to add `line: null`
- [ ] T010 [P] Update all `ActiveCommentThread` fixtures in `tests/unit/pr-comment-state.test.ts` to add `line: null`
- [ ] T011 [P] Update all `ActiveCommentThread` fixtures in `tests/unit/pr-status.test.ts` to add `line: null`

**Checkpoint**: `npm run lint && npm test && npm run build` must pass after T011 before proceeding.

---

## Phase 3: User Story 1 — Line Numbers in Human-Readable Output (Priority: P1) 🎯 MVP

**Goal**: `azdo pr comments` thread headers display `:N` after the file path for code-anchored threads.

**Independent Test**: Run `azdo pr comments` (or use the unit tests) against a PR that has
code-anchored threads. Each such thread's header must include `:<line>` suffix.

### Tests for User Story 1

- [ ] T012 [US1] Add 4 new test cases to `tests/unit/pr-client.test.ts` for `mapThread()` line extraction:
  - Case A: `rightFileStart: { line: 42, offset: 1 }` → `line: 42`
  - Case B: `rightFileStart` absent, `leftFileStart: { line: 7, offset: 3 }` → `line: 7`
  - Case C: `threadContext` present (filePath only), no position fields → `line: null`
  - Case D: `threadContext` absent (general thread) → `line: null`
- [ ] T013 [US1] Add assertions to `tests/unit/pr-comments.test.ts` that the formatted output for a code-anchored thread with `line: 42` contains the string `:42`
- [ ] T014 [US1] Add assertion to `tests/unit/pr-comments.test.ts` that a code-anchored thread with `line: null` shows only the file path (no colon suffix)
- [ ] T015 [US1] Add assertion to `tests/unit/pr-comments.test.ts` that a general thread (`threadContext: null`, `line: null`) shows `(general)` (unchanged)

### Implementation for User Story 1

- [ ] T016 [US1] Update `formatThreads()` in `src/commands/pr.ts` (line ~274): replace the thread header expression with a `location` variable that appends `:<line>` when `thread.line !== null`, falls back to just `thread.threadContext` when line is null, and uses `(general)` when `threadContext` is null

**Checkpoint**: US1 complete — `npm test` passes and human-readable output includes `:N` on code-anchored threads.

---

## Phase 4: User Story 2 — Line Numbers in JSON Output (Priority: P2)

**Goal**: `azdo pr comments --json` thread objects include `"line": <number|null>`.

**Independent Test**: Run `azdo pr comments --json` and inspect thread objects. Each must have
a `line` field: integer for code-anchored threads with known position, `null` otherwise.

### Tests for User Story 2

- [ ] T017 [US2] Add a `--json` output test to `tests/unit/pr-comments.test.ts`: verify that the serialised JSON for a thread with `line: 42` contains `"line":42` and for a general thread contains `"line":null`

### Implementation for User Story 2

- [ ] T018 [US2] Confirm no formatter change is needed for JSON output — `line` is automatically included because `ActiveCommentThread` now carries it and the JSON serialiser outputs all fields; add a code comment in `src/commands/pr.ts` near the JSON output path noting that `line` is structural (from T004)

**Checkpoint**: US2 complete — JSON output verified in tests.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Finalise non-functional requirements before PR.

- [ ] T019 Review `README.md` and update `azdo pr comments` command documentation to note that thread headers now show the line number (constitution requires README review before merge)
- [ ] T020 Run full verification: `npm run lint && npm test && npm run build` and confirm all pass with zero errors

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — run immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS both user stories
- **US1 (Phase 3)**: Depends on Phase 2 completion
- **US2 (Phase 4)**: Depends on Phase 2 completion; can run in parallel with Phase 3
- **Polish (Phase 5)**: Depends on Phases 3 and 4

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational type changes (T002–T006); fixture updates (T007–T011)
- **US2 (P2)**: Depends on Foundational type changes (T002–T006); fixture updates (T007–T011). Implementation is automatic; only test verification needed.
- US1 and US2 can proceed in parallel after Phase 2.

### Within Phases

- T002 → T003 → T004 (sequential — build up the type incrementally)
- T004 → T005, T006 (T005 and T006 can be parallel — different functions, same file)
- T007–T011 can all run in parallel (different test files)
- T012–T015 can run in parallel (all test additions, no inter-dependency)
- T016 depends on T012–T015 (implement after test cases are written)

---

## Parallel Example: Phase 2 Fixture Updates

```
# After T004 (ActiveCommentThread gains line field):
T007: update pr-client.test.ts fixtures
T008: update pr-comments.test.ts fixtures
T009: update pr-comments-filters.test.ts fixtures
T010: update pr-comment-state.test.ts fixtures
T011: update pr-status.test.ts fixtures
# All five can run in parallel — different files
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (T001)
2. Complete Phase 2 (T002–T011)
3. Complete Phase 3 tests (T012–T015) — ensure they fail first
4. Complete Phase 3 implementation (T016)
5. **STOP and VALIDATE**: `npm test` passes, human output shows `:N`
6. Optionally skip Phase 4 for a first increment

### Full Delivery (Both Stories)

1. Phases 1 → 2 → 3 and 4 (3 and 4 in parallel) → 5

---

## Notes

- [P] tasks = different files, no shared state, safe to parallelise
- T007–T011 (fixture updates) are mechanical: add `line: null` to every `ActiveCommentThread` object literal
- T016 is the only source-code change outside types/services — one function, ~3 lines
- SC-003 requires tests covering all four mapping cases (T012) and all output variants (T013–T015)
- SC-004 (`npm run lint && npm test && npm run build`) is the gate before marking the PR ready
