---

description: "Task list for fix-workitem-artifact-uri"

---

# Tasks: Fix malformed work item ArtifactLink URI

**Input**: Design documents from `/specs/035-fix-workitem-artifact-uri/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Included — this repo's existing `pr-client.ts` test suite already asserts FR-numbered
behavior (`tests/unit/pr-client.test.ts`), so this fix follows the same test-first pattern.

**Organization**: Tasks are grouped by the two user stories in spec.md (US1 = P1 link visibility,
US2 = P2 unlink consistency). Both stories are satisfied by the same single-function fix, but are
kept as separate, independently-verifiable checkpoints per the spec.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2)
- Exact file paths are included in every task description

## Path Conventions

Single project (existing repo layout): `src/`, `tests/` at repository root.

---

## Phase 1: Setup

**Purpose**: Establish a clean baseline before any change.

- [X] T001 Confirm the working tree is on branch `035-fix-workitem-artifact-uri` (`git status --porcelain` empty) and run `npm run build` to establish a clean baseline before touching `src/services/pr-client.ts`.

---

## Phase 2: Foundational

*(None.)* This fix changes a single existing function (`buildWorkItemArtifactUri` in
`src/services/pr-client.ts`) with no new shared infrastructure, models, or dependencies. Proceed
directly to User Story 1.

---

## Phase 3: User Story 1 - Linking a work item makes it visible in the Azure DevOps UI (Priority: P1) 🎯 MVP

**Goal**: `buildWorkItemArtifactUri` produces the `%2F`-encoded canonical artifact URI so the
link is stored in a form Azure DevOps' UI actually renders.

**Independent Test**: Run `tests/unit/pr-client.test.ts`'s
`linkWorkItemToPullRequest / unlinkWorkItemFromPullRequest` describe block; all assertions pass
against the corrected URI shape.

### Tests for User Story 1 ⚠️

> Write/update these tests FIRST, confirm they FAIL against the current (unfixed) code.

- [X] T002 [US1] In `tests/unit/pr-client.test.ts`, update the `artifactUri` constant (around line 539, inside `describe('linkWorkItemToPullRequest / unlinkWorkItemFromPullRequest')`) from `'vstfs:///Git/PullRequestId/project-guid/repo-guid/77'` to `'vstfs:///Git/PullRequestId/project-guid%2Frepo-guid%2F77'`. Run `npx vitest run tests/unit/pr-client.test.ts` and confirm the `links a work item not yet linked (FR-001)` and `treats an already-linked work item as a no-op (FR-005)` tests now FAIL against the current implementation (proves the test change is meaningful).
- [X] T003 [P] [US1] Add a unit test in `tests/unit/pr-client.test.ts` (new `it` block within the same describe) that calls `linkWorkItemToPullRequest` with a `projectId`/`repositoryId` mock pair and asserts the resulting `url` is built by joining percent-encoded segments with the literal `%2F` (covers FR-001's segment-level encoding requirement from the spec's Edge Cases, not just the literal `%2F` substring).

### Implementation for User Story 1

- [X] T004 [US1] In `src/services/pr-client.ts`, fix `buildWorkItemArtifactUri` (line 739) to percent-encode `projectId` and `repositoryId` with `encodeURIComponent` and join all three segments with the literal string `%2F`: `` `vstfs:///Git/PullRequestId/${encodeURIComponent(projectId)}%2F${encodeURIComponent(repositoryId)}%2F${prId}` `` (FR-001, FR-002, FR-004).
- [X] T005 [US1] Run `npx vitest run tests/unit/pr-client.test.ts` and confirm every test in the `linkWorkItemToPullRequest / unlinkWorkItemFromPullRequest` describe block (including T002 and T003) now PASSES.

**Checkpoint**: User Story 1 is fully functional and independently testable — link, already-linked no-op, and reported `url` all use the corrected, ADO-visible URI.

---

## Phase 4: User Story 2 - Unlinking removes the same relation the CLI created (Priority: P2)

**Goal**: `unlinkWorkItemFromPullRequest`'s matching lookup stays consistent with the corrected
URI produced by the same `buildWorkItemArtifactUri` fixed in User Story 1 — no separate
URI-construction logic to diverge.

**Independent Test**: Run the unlink-specific tests in `tests/unit/pr-client.test.ts` and confirm
they pass using the corrected URI with no additional matching-logic changes.

### Tests for User Story 2

- [X] T006 [US2] Confirm the existing `unlinks a linked work item (FR-002)` and `treats an unlinked work item as a no-op on unlink (FR-004)` tests in `tests/unit/pr-client.test.ts` (they reuse the `artifactUri` constant updated in T002) pass unchanged — no new test code needed since `unlinkWorkItemFromPullRequest`'s `findIndex` compares against the same `buildWorkItemArtifactUri` output.

### Implementation for User Story 2

- [X] T007 [US2] Read `unlinkWorkItemFromPullRequest` in `src/services/pr-client.ts` (around line 824) and confirm its `findIndex` comparison calls the same fixed `buildWorkItemArtifactUri` from T004 with no independent URI-building logic — no code change expected beyond T004; document the confirmation in the PR report's Testing section.

**Checkpoint**: Both user stories independently pass — link and unlink stay mutually consistent against the corrected URI.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T008 [P] Run the full validation suite: `npm run lint && npm test && npm run build`; fix any fallout from the change.
- [ ] T009 Review `README.md` per the constitution's Development Workflow rule (README MUST be reviewed after every completed SpecKit spec run) — check whether it documents `azdo pr work-items link/unlink` output or artifact URI examples that need updating; update if so, otherwise note no change was needed in the PR report.
- [ ] T010 Walk through `specs/035-fix-workitem-artifact-uri/quickstart.md`: steps 3 (JSON `url` shape) and 5 (repeat-call `noop: true`) are covered by the automated tests in T002/T003/T005; steps 2, 4, and 6 require a real Azure DevOps org/project and are deferred to manual owner verification — note this split in the PR report's Testing section.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: None — skipped, nothing blocks the user stories.
- **User Story 1 (Phase 3)**: Depends on Setup only. This is the MVP — it contains the actual fix.
- **User Story 2 (Phase 4)**: Depends on User Story 1's implementation task (T004) being complete, since both stories share the same `buildWorkItemArtifactUri` fix — US2 is verification-only, not a separate code change.
- **Polish (Phase 5)**: Depends on both user stories being complete.

### Within Each User Story

- Tests (T002, T003) written/updated and confirmed to FAIL before the implementation task (T004).
- T004 (implementation) before T005 (confirm tests pass).
- User Story 1 complete (T005) before starting User Story 2's verification (T006, T007).

### Parallel Opportunities

- T003 can run in parallel with T002 (different `it` blocks in the same file, no shared mutable state, both precede T004).
- T008 (validation suite) can start as soon as T004/T005/T007 are done, in parallel with T009/T010 (different concerns, no file conflicts).

---

## Parallel Example: User Story 1

```bash
# T002 and T003 both touch tests/unit/pr-client.test.ts but in non-overlapping regions
# (existing constant vs. a new it() block) — safe to draft together, then run once:
npx vitest run tests/unit/pr-client.test.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001).
2. Complete Phase 3: User Story 1 (T002-T005) — this alone fixes the reported bug and closes #84's core symptom.
3. **STOP and VALIDATE**: confirm `tests/unit/pr-client.test.ts` passes end to end.

### Incremental Delivery

1. Setup → User Story 1 (T002-T005) → fix is functionally complete.
2. User Story 2 (T006-T007) → confirms no divergent unlink logic; effectively a verification pass, not new implementation.
3. Polish (T008-T010) → full validation suite, README check, quickstart walkthrough → ready for PR.

---

## Notes

- [P] tasks touch different files or non-overlapping regions of the same file.
- Both user stories are satisfied by the single fix in T004; US2's tasks are deliberately
  verification-only per research.md's finding that no separate unlink URI-building logic exists.
- Commit after each phase (T001 setup only if it changes anything; T002-T005 as one "tests +
  fix" commit is acceptable given the tight coupling; T008-T010 as a polish commit).
- No live-ADO integration test is added — `tests/integration/work-items.test.ts` is
  `skipIf(SKIP_AZDO)` gated and out of scope unless the owner requests it.
