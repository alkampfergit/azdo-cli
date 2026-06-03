---
description: "Task list for feature 023-pr-comments-status"
---

# Tasks: Better support for commenting in the pull request

**Input**: Design documents from `/specs/023-pr-comments-status/` · **Issue**: #50
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/cli-commands.md

**Tests**: TDD requested — vitest unit tests are written before/with each implementation slice.

**Organization**: Grouped by user story (US1 fix checks · US2 comment filters · US3 status counts). Each story is independently testable.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: parallelizable (different file, no incomplete dependency)
- Single-project layout: `src/`, `tests/` at repo root.

---

## Phase 1: Setup

- [ ] T001 Confirm baseline is green on branch `023-pr-comments-status`: run `npm run lint && npm test && npm run build` and note any pre-existing failures before changing code.

---

## Phase 2: Foundational (blocking prerequisites)

Type extensions shared across stories — must land before story implementation.

- [ ] T002 [P] Add Azure DevOps policy-evaluation response shapes to `src/types/pull-request.ts` (`AzdoPolicyEvaluationListResponse`, `AzdoPolicyEvaluation` with `configuration.type.displayName`/`status`/`evaluationId`), plus a `AzdoProject` shape (`{ id: string }`) for the Projects API. No `any`.
- [ ] T003 [P] Extend `PullRequestCheck` in `src/types/pull-request.ts` with optional `source?: 'status' | 'policy'`, and extend the `pr status` per-PR result type with `codeCommentCounts: { open: number; closed: number }`.

**Checkpoint**: Types compile (`npx tsc --noEmit`); no behaviour change yet.

---

## Phase 3: User Story 1 — Status checks are actually shown (P1) 🎯 MVP

**Goal**: `pr status` lists branch policy evaluations + statuses; "none" only when genuinely empty; distinguish fetch error from empty.

**Independent test**: `azdo pr status` on a PR with a green build-validation policy lists the check instead of "none reported".

### Tests (write first)
- [ ] T004 [P] [US1] Add `tests/unit/pr-status-checks.test.ts`: map a policy-evaluation payload to `PullRequestCheck` (state normalisation approved→succeeded, rejected→failed, running/queued→pending, notApplicable/notSet dropped), and assert merged union with statuses. (Test must fail initially.)
- [ ] T005 [P] [US1] In the same test file, assert empty-vs-error: union empty + both fetches OK ⇒ "none reported"; a fetch error ⇒ a distinct "unable to retrieve" outcome (not "none").

### Implementation
- [ ] T006 [US1] Add `resolveProjectId(context, cred)` to `src/services/pr-client.ts`: `GET _apis/projects/{project}?api-version=7.1` → `.id`; memoise within the call. Reuse `fetchWithErrors`/`readJsonResponse`.
- [ ] T007 [US1] Add `getPullRequestPolicyEvaluations(context, repo, cred, projectId, prId)` to `src/services/pr-client.ts`: `GET {project}/_apis/policy/evaluations?artifactId=vstfs:///CodeReview/CodeReviewId/{projectId}/{prId}&api-version=7.1`; add `mapPolicyEvaluationCheck` mapping → `PullRequestCheck` (`source: 'policy'`), dropping notApplicable/notSet (mirror `mapPullRequestCheck`).
- [ ] T008 [US1] Tag existing status results with `source: 'status'` in `mapPullRequestCheck` (`src/services/pr-client.ts`).
- [ ] T009 [US1] In `createPrStatusCommand` (`src/commands/pr.ts`): resolve project id once, fetch statuses + policy evaluations per PR, merge into `checks`. Track per-source fetch success so the empty-vs-error decision is possible.
- [ ] T010 [US1] Update `formatPullRequestChecks` (`src/commands/pr.ts`) to print the union, and only emit `Checks: none reported by Azure DevOps` when both sources succeeded and the union is empty; emit a distinct `Checks: unable to retrieve (…)` line when a fetch failed.
- [ ] T011 [US1] Ensure `--json` output for `pr status` includes merged `checks` with `source`. Verify T004/T005 pass.

**Checkpoint**: US1 independently shippable — `pr status` surfaces policy checks.

---

## Phase 4: User Story 2 — Filter PR comments (P1)

**Goal**: `--code-related-only` and `--exclude-resolved` (alias of existing `--hide-resolved`), independent + combinable, default off.

**Independent test**: on a PR mixing anchored/general and resolved/unresolved threads, each flag narrows output; no-flag output unchanged.

### Tests (write first)
- [ ] T012 [P] [US2] Extend `tests/unit/pr-comment-state.test.ts` (or add `tests/unit/pr-comments-filters.test.ts`): assert `--code-related-only` keeps only `threadContext !== null` threads; `--exclude-resolved` behaves identically to `--hide-resolved`; both compose to unresolved-code-only; and no-flag output is unchanged (regression, FR-006). (Fails initially.)

### Implementation
- [ ] T013 [US2] In `createPrCommentsCommand` (`src/commands/pr.ts`): add `--code-related-only` option (`codeRelatedOnly`) and `--exclude-resolved` option mapped to the same `hideResolved` boolean as `--hide-resolved` (OR them; keep both names). Update `PrCommandOptions`/comments-options type.
- [ ] T014 [US2] Apply the `threadContext !== null` filter alongside the existing resolved filter (compose, order-independent) in the comments action; reflect the filtered set in both human and `--json` output.
- [ ] T015 [US2] Update the empty-result messaging to name the active filter(s) (e.g. "No code-related comment threads…", "No unresolved comment threads…"). Verify T012 passes.

**Checkpoint**: US2 independently shippable — comment filters work, no regression.

---

## Phase 5: User Story 3 — Code-comment counts in status (P2)

**Goal**: `pr status` shows open/closed counts of code-anchored threads.

**Independent test**: counts match the number of open vs resolved file-anchored threads; general threads excluded; zero when none.

### Tests (write first)
- [ ] T016 [P] [US3] Add `tests/unit/pr-code-comment-counts.test.ts`: from a thread set (mix of anchored/general, resolved/active), assert `{ open, closed }` counts code-anchored only, via `isThreadResolved`; general threads excluded; empty ⇒ `{0,0}`. (Fails initially.)

### Implementation
- [ ] T017 [US3] In `createPrStatusCommand` (`src/commands/pr.ts`): also call `getPullRequestThreads` per PR and compute `codeCommentCounts = { open, closed }` over code-anchored threads using `isThreadResolved`.
- [ ] T018 [US3] Render a `Code comments: N open, M closed` line per PR in human output and add `codeCommentCounts` to the `--json` result. Verify T016 passes.

**Checkpoint**: US3 shippable — status shows comment counts.

---

## Phase 6: Polish & cross-cutting

- [ ] T019 [P] Update `docs/commands.md`: document `pr status` policy-evaluation checks + `Code comments` line, and `pr comments` `--code-related-only` / `--exclude-resolved` (alias of `--hide-resolved`).
- [ ] T020 [P] Review/update `README.md` per constitution (new flags + status output), if the PR surface is described there.
- [ ] T021 Finalise the PR report (`specs/023-pr-comments-status/pr-report.md`) — What's New / Testing sections (done in speckit-gh step 11).
- [ ] T022 Full gate: `npm run lint && npm test && npm run build` all green; manual quickstart spot-check from `quickstart.md` if a live PR is available.

---

## Dependencies & order

- **Setup (T001)** → **Foundational (T002–T003)** → stories.
- **US1 (T004–T011)** depends only on Foundational. **MVP = US1.**
- **US2 (T012–T015)** depends only on Foundational — independent of US1.
- **US3 (T016–T018)** depends on Foundational; conceptually related to US2 (shared code-anchored predicate) but independently testable.
- **Polish (T019–T022)** after the stories it documents.

Story phases are independent and could be done in parallel by separate agents; within a phase, tests precede implementation (TDD).

## Parallel execution examples

- Foundational: `T002` and `T003` in parallel (same file `types/pull-request.ts` — coordinate or do sequentially if conflicting; mark [P] only because logically distinct).
- Tests `T004`, `T005` (US1), `T012` (US2), `T016` (US3) are in different test files → parallelizable.
- Docs `T019`, `T020` parallel.

## Implementation strategy

1. Ship **US1** first (the reported bug, highest value) → validate `pr status`.
2. Add **US2** filters.
3. Add **US3** counts.
4. Polish docs + final gate.
