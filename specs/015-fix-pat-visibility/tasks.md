# Tasks: Fix PAT Input Visibility Bug

**Input**: Design documents from `/specs/015-fix-pat-visibility/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓

## Phase 1: Setup

**Purpose**: No new setup required; this is a single-file bug fix.

*(No tasks — project structure and dependencies are unchanged.)*

---

## Phase 2: Foundational

**Purpose**: No foundational changes needed; the fix is self-contained.

*(No tasks.)*

---

## Phase 3: User Story 1 - Secure PAT Entry (Priority: P1) 🎯 MVP

**Goal**: Prevent raw PAT characters from ever appearing on the terminal during PAT entry.

**Independent Test**: Run any azdo-cli command without a stored PAT, paste a long token, and confirm only the masked display appears — no raw text, no extra line.

### Implementation

- [X] T001 [US1] Fix readline echo: change `output: process.stderr` to `output: null` in `createInterface` call in `src/services/auth.ts` (line 29)
- [X] T002 [US1] Verify existing unit tests in `tests/unit/auth.test.ts` still pass with no changes required

**Checkpoint**: After T001, paste behavior should show only masked display on the prompt line.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [X] T003 Run full test suite (`npm test`) and confirm zero failures
- [X] T004 Run linter (`npm run lint`) and confirm zero new warnings

---

## Dependencies & Execution Order

- T001: Implement fix in `src/services/auth.ts`
- T002: Verify tests pass (depends on T001)
- T003: Run full suite (depends on T001, T002)
- T004: Run lint (can run in parallel with T003)

---

## Implementation Strategy

This is a focused bug fix. The entire change is one argument in one function call:

```
createInterface({ input: process.stdin, output: null })
```

No new files, no new tests (existing coverage is sufficient), no API changes.
