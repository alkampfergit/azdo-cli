---
description: "Task list for PR Work Item Links, Reviewer Management, and Template-Aware Creation"
---

# Tasks: PR Work Item Links, Reviewer Management, and Template-Aware Creation

**Input**: Design documents from `/specs/034-pr-link-review/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: Included — this repository's existing `pr` features (see `tests/unit/pr-command-tree.test.ts`, `tests/unit/pr-client.test.ts`) always ship unit coverage alongside new commands, and `docs/commands.md` documents the exit-code/`--json` contract these tests pin.

**Organization**: Tasks are grouped by user story (P1/P2/P3 from spec.md) so each can be implemented, tested, and reviewed independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 = work item links, US2 = reviewers, US3 = PR templates

## Path Conventions

Single project — `src/`, `tests/` at repository root (see plan.md Project Structure).

---

## Phase 1: Setup

**Purpose**: Confirm a clean baseline before touching `pr.ts` / `pr-client.ts`.

- [X] T001 Run `npm run lint && npm run typecheck && npm run build` on `034-pr-link-review` to confirm a clean baseline (no new dependencies are introduced by this feature per plan.md)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Type definitions shared by all three user stories.

**⚠️ CRITICAL**: No user story implementation task may start until this phase is complete — every story's service functions import these types.

- [X] T002 Add `Reviewer`, `WorkItemLink`, and `PullRequestTemplate` type definitions to `src/types/pull-request.ts` per [data-model.md](data-model.md) (no `any`; explicit fields as specified: `Reviewer.id/displayName/uniqueName/isRequired/vote`, `WorkItemLink.pullRequestId/workItemId/url`, `PullRequestTemplate.path/content/kind`)

**Checkpoint**: Types compile (`npm run typecheck`) — user story implementation can begin.

---

## Phase 3: User Story 1 - Link and unlink work items on a pull request (Priority: P1) 🎯 MVP

**Goal**: `azdo pr work-items link <id>` / `unlink <id>` create and remove an `ArtifactLink` relation between a work item and the target pull request.

**Independent Test**: Link a known work item id to a real PR, confirm it appears in the Azure DevOps **Work items** panel; unlink it and confirm it disappears. Re-running `link` on an already-linked id, or `unlink` on a not-linked id, exits 0 as a no-op.

### Tests for User Story 1

> Write these first; they must fail against the current `pr-client.ts` / `pr.ts` before implementation.

- [X] T003 [P] [US1] Unit tests for `resolveRepositoryId`, work-item-relations GET, `linkWorkItemToPullRequest`, and `unlinkWorkItemFromPullRequest` (happy path, already-linked no-op, not-linked no-op, 404 work item) in `tests/unit/pr-client.test.ts`
- [X] T004 [P] [US1] Extend `tests/unit/pr-command-tree.test.ts` with `azdo pr work-items link <id>` / `unlink <id>` cases driven through the real command tree: option plumbing (`--org`/`--project`/`--repo`/`--pr-number`/`--json` all reach the child action, mirroring the 033 nested-option-loss regression), invalid `workItemId` validation, and JSON output shape

### Implementation for User Story 1

- [X] T005 [US1] Add `resolveRepositoryId(context, repo, cred)` to `src/services/pr-client.ts` (contracts/api-calls.md §1 — `GET /_apis/git/repositories/{repo}`, returns the repository GUID)
- [X] T006 [US1] Add `getWorkItemRelations(context, cred, workItemId)` to `src/services/pr-client.ts` (contracts/api-calls.md §5 — `GET /_apis/wit/workitems/{id}?$expand=relations`); a 404 throws `NOT_FOUND` (reused by `handlePrCommandError`)
- [X] T007 [US1] Add `linkWorkItemToPullRequest(context, repo, cred, prId, workItemId)` to `src/services/pr-client.ts`: resolve `projectId` (existing `resolveProjectId`) + `repositoryId` (T005), build the `vstfs:///Git/PullRequestId/{projectId}/{repositoryId}/{prId}` URI, check T006's relations for an existing match (FR-005 no-op) before `PATCH .../workitems/{id}` adding the relation (contracts/api-calls.md §6)
- [X] T008 [US1] Add `unlinkWorkItemFromPullRequest(context, repo, cred, prId, workItemId)` to `src/services/pr-client.ts`: find the matching relation's array index from T006 (no match → FR-004 no-op, no network write) then `PATCH` removing that index
- [X] T009 [US1] Add `createPrWorkItemsCommand()` in `src/commands/pr.ts`: parent `work-items` group registering `link <workItemId>` and `unlink <workItemId>` children, reusing `withCommonPrOptions` + `resolvePullRequestTarget` + the `mergedPrOptions(command)` pattern (see `mergedPrOptions` doc comment) so nested `--org/--project/--repo/--pr-number/--json` are not silently dropped, per contracts/cli-commands.md
- [X] T010 [US1] Wire `link`/`unlink` action handlers to T007/T008, validating `workItemId` as a positive integer (reuse `parsePositivePrNumber`), and emit the human/`--json` output shapes from contracts/cli-commands.md (`{ pullRequestId, workItemId, noop }`)
- [X] T011 [US1] Register `createPrWorkItemsCommand()` under `createPrCommand()` in `src/commands/pr.ts`

**Checkpoint**: `azdo pr work-items link|unlink` fully functional and independently testable (US2/US3 not required).

---

## Phase 4: User Story 2 - Add and remove required and optional reviewers (Priority: P2)

**Goal**: `azdo pr reviewers add <reviewer> [--required]` / `remove <reviewer>` manage a PR's reviewer list, resolving email/unique-name to an identity GUID first.

**Independent Test**: Add a real reviewer as required, confirm the "Required" badge in the Azure DevOps UI; add a second as optional; remove one and confirm it disappears. Re-adding an existing reviewer with a different `--required` value updates in place (no duplicate); removing a non-reviewer is a no-op.

### Tests for User Story 2

- [X] T012 [P] [US2] Unit tests for `resolveReviewerIdentity` (single match, zero matches, ambiguous multiple matches), `addOrUpdatePullRequestReviewer`, and `removePullRequestReviewer` (add-new, promote-in-place, remove-existing, remove-absent no-op) in `tests/unit/pr-client.test.ts`
- [X] T013 [P] [US2] Extend `tests/unit/pr-command-tree.test.ts` with `azdo pr reviewers add <reviewer> [--required]` / `remove <reviewer>` cases through the real command tree: option plumbing, unresolvable-identity error message, and JSON output shape

### Implementation for User Story 2

- [X] T014 [US2] Add `resolveReviewerIdentity(org, cred, input)` to `src/services/pr-client.ts` (contracts/api-calls.md §4 — `GET https://vssps.dev.azure.com/{org}/_apis/identities?searchFilter=General&filterValue={input}`); zero or multiple matches throw a `RESOLVE_FAILED:<input>` error surfaced as FR-009's message naming `<input>`
- [X] T015 [US2] Add `addOrUpdatePullRequestReviewer(context, repo, cred, prId, reviewerId, isRequired)` to `src/services/pr-client.ts` (contracts/api-calls.md §2 — `PUT .../pullRequests/{prId}/reviewers/{reviewerId}` with `{ vote: 0, isRequired }`)
- [X] T016 [US2] Add `removePullRequestReviewer(context, repo, cred, prId, reviewerId)` to `src/services/pr-client.ts`: check the PR's current reviewer list first (existing PR object already carries reviewers, or a light `GET` if not) for FR-010's no-op, else `DELETE .../pullRequests/{prId}/reviewers/{reviewerId}` (contracts/api-calls.md §3)
- [X] T017 [US2] Add `createPrReviewersCommand()` in `src/commands/pr.ts`: parent `reviewers` group registering `add <reviewer> [--required]` and `remove <reviewer>` children, same `mergedPrOptions` pattern as T009
- [X] T018 [US2] Wire `add`/`remove` action handlers to T014–T016, emitting the human/`--json` shapes from contracts/cli-commands.md (`{ pullRequestId, reviewer: {...} | null, noop }`)
- [X] T019 [US2] Register `createPrReviewersCommand()` under `createPrCommand()` in `src/commands/pr.ts`

**Checkpoint**: `azdo pr reviewers add|remove` fully functional and independently testable (does not depend on US1).

---

## Phase 5: User Story 3 - Create pull requests from a repository-defined template (Priority: P3)

**Goal**: `azdo pr open` without `--description` resolves a repository-defined template (branch-specific, multi-level fallback, then default) from the repo's default branch and uses it as (or prepends the operator's text to) the description.

**Independent Test**: Commit `docs/pull_request_template/branches/develop.md` to the default branch; run `pr open --title "x"` with no `--description` against a branch targeting `develop`; confirm the created PR's description equals the template content. Repeat with `--description` supplied and confirm the description is `<text>\n\n<template>`.

### Tests for User Story 3

- [X] T020 [P] [US3] Unit tests for `resolvePullRequestTemplate` (branch-specific match at each of the four candidate roots, multi-level branch fallback, default-template fallback, no-template-found, 404-per-candidate-continues-search) in `tests/unit/pr-client.test.ts`
- [X] T021 [P] [US3] Extend `tests/unit/pr-command-tree.test.ts` (or a new `pr-open.test.ts`) with the four `pr open` description/template cases from contracts/cli-commands.md, including the unchanged "no template, no `--description`" error

### Implementation for User Story 3

- [X] T022 [US3] Add `resolvePullRequestTemplate(context, repo, cred, defaultBranch, targetBranch)` to `src/services/pr-client.ts` (contracts/api-calls.md §7): search branch-specific paths from most- to least-specific branch segment across `.azuredevops/`, `.vsts/`, `docs/`, and repo root, then the same four roots for `pull_request_template.md`; a 404 on any candidate continues the search, any other error aborts it
- [X] T023 [US3] Update `openPullRequest()` in `src/services/pr-client.ts` to accept an optional description and call T022 when it is absent, composing the final description per FR-012–FR-014 (template alone / text-then-template / text-alone / neither → existing error)
- [X] T024 [US3] Update `createPrOpenCommand()` in `src/commands/pr.ts`: make `--description` optional, resolve the default branch (existing `AzdoContext`/repo lookup) to pass into T023, and preserve today's `Error: --description is required for pull request creation.` only when neither a template nor `--description` is available (FR-013)

**Checkpoint**: All three user stories independently functional; `azdo pr` now supports work item links, reviewer management, and template-aware creation.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T025 [P] Update `docs/commands.md` with `pr work-items link|unlink`, `pr reviewers add|remove`, and the `pr open` `--description`-becomes-optional behavior change
- [X] T026 Review and update `README.md` to reflect the new commands and usage examples (constitution Development Workflow requirement)
- [ ] T027 Manually run through [quickstart.md](quickstart.md)'s verification checklist against a real Azure DevOps project
- [X] T028 [P] Full verification pass: `npm run lint && npm run typecheck && npm test && npm run build` (zero errors/warnings per constitution IV)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup — blocks all user stories (every story's types come from T002)
- **User Stories (Phase 3–5)**: each depends only on Foundational; US1/US2/US3 have no dependencies on each other and can be implemented in any order or in parallel
- **Polish (Phase 6)**: depends on whichever user stories are in scope for the release being prepared

### Within Each User Story

- Tests (T003–T004, T012–T013, T020–T021) are written first and must fail before their story's implementation tasks
- Service-layer functions (`pr-client.ts`) before the command layer (`pr.ts`) that calls them
- Command registration (e.g. T011, T019) last, after the command and its action handler exist

### Parallel Opportunities

- T003 and T004 (US1 tests) in parallel; likewise T012/T013 (US2) and T020/T021 (US3)
- Once Phase 2 (T002) is done, US1, US2, and US3 can proceed fully in parallel — they touch disjoint sets of new functions in the same two files (`pr-client.ts`, `pr.ts`), so sequence commits per story to avoid merge noise even though there's no logical dependency
- T025 and T028 in Phase 6 can run in parallel with each other

---

## Parallel Example: User Story 1

```bash
# Tests first, in parallel (different describe blocks, same or new files):
Task: "Unit tests for resolveRepositoryId/link/unlink in tests/unit/pr-client.test.ts"
Task: "Extend tests/unit/pr-command-tree.test.ts with work-items link/unlink cases"

# Then service layer, sequentially (same file, dependent helpers):
Task: "Add resolveRepositoryId to src/services/pr-client.ts"
Task: "Add getWorkItemRelations to src/services/pr-client.ts"
Task: "Add linkWorkItemToPullRequest to src/services/pr-client.ts"
Task: "Add unlinkWorkItemFromPullRequest to src/services/pr-client.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (T002)
3. Complete Phase 3: User Story 1 (work item link/unlink)
4. **STOP and VALIDATE**: run T003/T004 plus a manual link/unlink against a real PR
5. PR-report and PR can go out with just US1 if the owner wants an early increment; otherwise continue

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. User Story 1 (P1) → validate → this is the MVP slice
3. User Story 2 (P2) → validate independently
4. User Story 3 (P3) → validate independently
5. Polish (Phase 6) once the owner-approved scope for this PR is complete

---

## Notes

- No `[P]` marker inside a single story's implementation tasks on `pr-client.ts`/`pr.ts` — same files, sequenced to avoid clobbering each other's edits; `[P]` is only used for genuinely independent files/describe-blocks (tests) or cross-story work.
- Every new write command follows the existing `handlePrCommandError` error-mapping and `EXIT_NOT_FOUND` (3) / `EXIT_NOT_PERMITTED` (4) exit-code contract — no new error-handling pattern.
- Commit after each task or logical group, scoped `#82` per the issue this feature closes.
