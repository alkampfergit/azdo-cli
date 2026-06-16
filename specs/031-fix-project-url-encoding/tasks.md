# Tasks: Fix URL Percent-Encoding for ADO Project Names with Spaces

**Input**: Design documents from `/specs/031-fix-project-url-encoding/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, quickstart.md ✅

**Scope**: 1 source file (`src/services/git-remote.ts`), 1 test file (`tests/unit/git-remote.test.ts`).  
**Tests**: Included — one existing test must be updated (it asserts the buggy behavior); five new tests are added.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different tasks/test cases, no file conflicts between them)
- **[Story]**: Which user story this task belongs to ([US1], [US2], [US3])

---

## Phase 1: Setup

No project setup required — targeted bug fix in existing files only.

---

## Phase 2: Foundational (blocking prerequisite)

**Purpose**: Add the safe-decode helper that both fix sites will call. Must exist before Phase 3.

- [x] T001 Add `decodePctSegment(segment: string): string` helper function just above `matchAzdoRemote` in `src/services/git-remote.ts`. The helper wraps `decodeURIComponent` in try/catch and returns the raw segment on error (handles malformed `%GG`-style sequences).

**Checkpoint**: Helper is present and compiles before any story work begins.

---

## Phase 3: User Story 1 — Auto-detect Project with Spaces (Priority: P1) 🎯 MVP

**Goal**: `detectAzdoContext()` and `parseAzdoRemote()` return the decoded project name (e.g., `Course Examples Builds`) when the remote URL contains percent-encoded characters.

**Independent Test**: Run `npm run test:unit` — the updated + new tests in `tests/unit/git-remote.test.ts` must all pass.

### Implementation

- [x] T002 [US1] In `matchAzdoRemote` in `src/services/git-remote.ts`, change `const project = match[2];` to `const project = decodePctSegment(match[2]);`
- [x] T003 [US1] In `parseAzdoRemote` in `src/services/git-remote.ts`, change `const project = match[2];` to `const project = decodePctSegment(match[2]);` (two occurrences in that function — both the main path and the DefaultCollection branch)

### Tests (update + add)

- [x] T004 [US1] Update the existing test `'handles org and project with special characters'` in `tests/unit/git-remote.test.ts` (currently line ~39): change the expected value from `project: 'my%20project'` to `project: 'my project'` (this test currently asserts the buggy behavior)
- [x] T005 [P] [US1] Add test in `tests/unit/git-remote.test.ts`: `parseAzdoRemote('https://dev.azure.com/gianmariaricci/Course%20Examples%20Builds/_git/JavaCalendar')` → `{ org: 'gianmariaricci', project: 'Course Examples Builds' }`
- [x] T006 [P] [US1] Add test in `tests/unit/git-remote.test.ts`: `parseAzdoRemote` with multi-space name `My%20Awesome%20Project` → `{ org: 'myorg', project: 'My Awesome Project' }`
- [x] T007 [P] [US1] Add test in `tests/unit/git-remote.test.ts`: `parseAzdoRemote` with userinfo prefix + encoded project: `'https://user:token@dev.azure.com/org/My%20Project/_git/repo'` → `{ org: 'org', project: 'My Project' }` (with `vi.spyOn(process.stderr, 'write')` to silence credential warning)
- [x] T008 [P] [US1] Add test in `tests/unit/git-remote.test.ts`: `gitConfigToRemoteLines` + `parseAllAzdoRemotes` end-to-end for a `.git/config` whose remote URL contains `Course%20Examples%20Builds` — the resulting `RemoteCandidate.project` must equal `'Course Examples Builds'`
- [x] T009 [P] [US1] Add test in `tests/unit/git-remote.test.ts` (new `describe` block `decodePctSegment resilience`): `parseAzdoRemote('https://dev.azure.com/org/My%GGProject/_git/repo')` must not throw and must return the raw `'My%GGProject'` as the project name (graceful fallback)

**Checkpoint**: `npm run test:unit` green. US1 fully verified.

---

## Phase 4: User Story 2 — Explicit `--project` Unchanged (Priority: P2)

**Goal**: Confirm the fix has no impact on the explicit `--project` code path.

**Independent Test**: Existing test `'parses HTTPS current format'` and the entire `parseAzdoRemote — userinfo + .git recognition (C-5)` suite still pass — no assertions change.

### Verification

- [x] T010 [US2] Review `tests/unit/git-remote.test.ts`: confirm no test that exercises the explicit `--project` path needs modification. The explicit `--project` flow bypasses `git-remote.ts` entirely (it is wired in `context.ts` / command option parsing), so no source change is required. Add a comment in the test file if the explicit path is not tested at unit level, noting it is covered by integration tests.

**Checkpoint**: Zero test changes for US2; existing tests green.

---

## Phase 5: User Story 3 — Non-encoded Project Names Unaffected (Priority: P3)

**Goal**: Confirm the FROZEN_BASELINE and all existing non-encoded URL tests still pass byte-for-byte.

**Independent Test**: `npm run test:unit` — the `parseAzdoRemote / parseRepoName — frozen parity (C-7, FR-007)` describe block must pass with zero modifications to `tests/unit/fixtures/git-remote.cases.ts`.

### Verification

- [x] T011 [US3] Confirm `tests/unit/fixtures/git-remote.cases.ts` requires no changes (all 5 FROZEN_BASELINE URLs contain no percent-encoded segments; `decodePctSegment` is a no-op on plain ASCII strings). Add a note to the fixture file header if helpful.

**Checkpoint**: FROZEN_BASELINE passes unchanged; regression safety confirmed.

---

## Phase 6: Polish & Cross-Cutting

- [x] T012 Run full validation suite: `npm test` (lint + type-check + unit + build). Fix any lint or type errors introduced by the helper function.
- [x] T013 Review `README.md` section on project auto-detection from git remote. If a "project names with spaces" note is absent, add one sentence: "Project names containing spaces are supported — the CLI decodes percent-encoded remote URLs automatically."

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: Start immediately — no dependencies.
- **US1 (Phase 3)**: Requires T001 (helper). T002 and T003 must precede T004–T009 (tests require the fix to be present to verify correct behavior).
- **US2 (Phase 4)**: Can run in parallel with Phase 3 (different scope — verification only).
- **US3 (Phase 5)**: Can run in parallel with Phase 3 (FROZEN_BASELINE is read-only).
- **Polish (Phase 6)**: After all user story phases complete.

### Parallel Opportunities

- T005, T006, T007, T008, T009 — all new test cases can be written in parallel (each is a self-contained `it()` block).
- T010 (US2 verification) and T011 (US3 verification) can run in parallel with Phase 3 implementation.

---

## Implementation Strategy

### MVP (User Story 1 only)

1. T001 — add helper
2. T002, T003 — apply fixes
3. T004 — update broken assertion
4. T005–T009 — add new tests
5. `npm run test:unit` — confirm green
6. **Done**: core bug fixed and verified

### Full Delivery

1. MVP above
2. T010, T011 — regression confirmations
3. T012 — full suite
4. T013 — README polish

---

## Notes

- [P] tasks = independent test cases in the same file — write them in any order, commit together.
- The FROZEN_BASELINE file (`tests/unit/fixtures/git-remote.cases.ts`) must **never** be regenerated from the post-fix parser — it is a regression anchor.
- `decodePctSegment` must be `function`-scoped (not exported) — it is an internal implementation detail.
- Commit message: `fix(#71): decode percent-encoded project name from git remote URL`
