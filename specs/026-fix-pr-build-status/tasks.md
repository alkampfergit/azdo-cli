# Tasks: Fix `azdo pr status` Build/Pipeline Check Retrieval

**Input**: Design documents from `/specs/026-fix-pr-build-status/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Organization**: 3 user stories, ordered P1 → P2 → P3. All depend on the shared type-change foundation in Phase 2. Each story is independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[Story]**: US1 = Pipeline checks visible; US2 = Optional/required labels; US3 = JSON parity

---

## Phase 1: Setup (Shared Infrastructure)

*No new project structure or dependencies needed — all files already exist.*

---

## Phase 2: Foundational (Type Changes — Required by All Stories)

**Purpose**: Extend the shared TypeScript types. Must complete before US1–US3 implementation.

**⚠️ CRITICAL**: All user story implementation tasks depend on these type definitions.

- [x] T001 Add `definition?: { id?: number; name?: string }` to `AzdoBuild` interface in `src/types/pipeline.ts` (current definition only has `id`)
- [x] T002 [P] Add `isBlocking?: boolean | null` field and extend `source` union to `'status' | 'policy' | 'build'` in `PullRequestCheck` interface in `src/types/pull-request.ts`
- [x] T003 [P] Add integration-test env var `AZDO_PR_ID_WITH_BUILDS` to `tests/integration/helpers/integration-utils.ts` (export as `number | null`, same pattern as existing `AZDO_PR_ID`)

**Checkpoint**: Types compile cleanly (`npm run build` passes). Foundation ready.

---

## Phase 3: User Story 1 — View Pipeline Check Status on a PR (Priority: P1) 🎯 MVP

**Goal**: `azdo pr status` shows actual pipeline check statuses for PRs with builds, instead of "unable to retrieve".

**Independent Test**: Run `AZDO_PR_ID_WITH_BUILDS=65 npm run test:integration` and verify the new `getPullRequestBuilds` describe block passes with at least one check returned.

### Implementation for User Story 1

- [x] T004 [P] [US1] Add private URL helper `buildPullRequestBuildsUrl(context, prId)` in `src/services/pr-client.ts` — builds `GET /_apis/build/builds?branchName=refs/pull/{prId}/merge&queryOrder=queueTimeDescending&$top=50&api-version=7.1`
- [x] T005 [P] [US1] Add private state mapper `mapBuildToCheckState(build: AzdoBuild): string` in `src/services/pr-client.ts` — maps `status`+`result` pairs to `'pending' | 'succeeded' | 'failed' | 'error'` per the state table in `data-model.md`
- [x] T006 [US1] Implement `getPullRequestBuilds(context, cred, prId)` in `src/services/pr-client.ts` — calls the builds URL, imports `AzdoBuildListResponse` from `../types/pipeline.js`, maps each build to `PullRequestCheck` with `source: 'build'` and `isBlocking: null`
- [x] T007 [US1] Update `buildPullRequestStatusEntry` in `src/commands/pr.ts` — add third `buildChecks` source: call `getPullRequestBuilds`, set `buildsOk`, include `buildChecks` in the merged `checks` array; update `checksError` condition to `checks.length === 0 && (!statusOk || !policyOk || !buildsOk)`
- [x] T008 [P] [US1] Add integration test suite `describe('getPullRequestBuilds')` in `tests/integration/pull-requests.test.ts` — guarded by `AZDO_PR_ID_WITH_BUILDS`; asserts: returns array, each entry has `id`, `state`, `name`, `source === 'build'`; throws `NOT_FOUND` for nonexistent PR; throws `AUTH_FAILED` for bad PAT

**Checkpoint**: `azdo pr status` on PR #65 shows at least one check entry. `npm run test:integration` passes (with `AZDO_PR_ID_WITH_BUILDS=65`).

---

## Phase 4: User Story 2 — Distinguish Optional vs Required Checks (Priority: P2)

**Goal**: Policy-sourced checks with `isBlocking === false` display `[optional]` suffix in human output.

**Independent Test**: Run `azdo pr status` on a PR with at least one non-blocking policy check; the output shows `[optional]` on the appropriate line. Output for required checks is unchanged.

### Implementation for User Story 2

- [x] T009 [P] [US2] Update `mapPolicyEvaluationCheck` in `src/services/pr-client.ts` — set `isBlocking: evaluation.configuration?.isBlocking ?? null` on the returned `PullRequestCheck`
- [x] T010 [US2] Update `formatPullRequestChecks` in `src/commands/pr.ts` — append ` [optional]` to the check line when `check.isBlocking === false`; no change for `true` or `null`/`undefined`

**Checkpoint**: `azdo pr status` human output shows `[optional]` for non-blocking policy checks; format is unchanged for required checks and build-source checks.

---

## Phase 5: User Story 3 — JSON Output Includes Build Check Data (Priority: P3)

**Goal**: `azdo pr status --json` output includes build-source checks with `source: 'build'` and `isBlocking: null`.

**Independent Test**: `azdo pr status --json | jq '.pullRequests[0].checks'` returns a non-empty array for PR #65, with at least one entry having `"source": "build"`.

### Implementation for User Story 3

*US3 is largely delivered by US1+US2 type changes (build checks are already in the array, `isBlocking` and `source` are on the type). The only task is to confirm JSON output is correct and add integration coverage.*

- [x] T011 [P] [US3] Add assertion to the existing `AZDO_PR_ID_WITH_BUILDS` integration test: when run with `--json`, the result's `checks` array includes at least one entry with `source === 'build'` and an `isBlocking` field present (in `tests/integration/pull-requests.test.ts`)

**Checkpoint**: `azdo pr status --json` output verified to include build-source check data.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T012 Run full verification: `npm run lint && npm test && npm run build` — all must pass with zero errors and zero warnings
- [x] T013 [P] Review and update `README.md` to note that `azdo pr status` now shows pipeline build checks alongside policy checks (constitution requirement: README must reflect implemented functionality before merge)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No external dependencies — start immediately
- **US1 (Phase 3)**: Depends on T001, T002, T003 (type changes)
- **US2 (Phase 4)**: Depends on T002 (isBlocking field on PullRequestCheck); can proceed in parallel with US1 after T002 completes
- **US3 (Phase 5)**: Depends on US1 (getPullRequestBuilds in place) and T002 (build source type)
- **Polish (Phase 6)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: Depends on T001 (AzdoBuild.definition.name), T002 (PullRequestCheck.source extended), T003 (AZDO_PR_ID_WITH_BUILDS)
- **US2 (P2)**: Depends on T002 (PullRequestCheck.isBlocking field). Can run in parallel with US1 (different functions, no file conflicts in service layer)
- **US3 (P3)**: Depends on US1 completion (build checks in array) + T002 (isBlocking field)

### Within Each User Story

- T004, T005 [P] — URL helper and state mapper are independent of each other
- T006 depends on T004, T005
- T007 depends on T006 (import of getPullRequestBuilds)
- T008 [P] with T004, T005 — integration test skeleton can be written while implementation proceeds
- T009, T010 [P] — can be implemented simultaneously (different files)

### Parallel Opportunities

Phase 2: T001, T002, T003 can all run in parallel (different files)  
Phase 3: T004 and T005 can run in parallel; T008 test skeleton in parallel with T006+T007  
Phase 4: T009 and T010 can run in parallel  
Phase 6: T012 and T013 can start in parallel after all stories complete

---

## Parallel Example: User Story 1

```
Parallel batch 1 (foundational):
  T001 — src/types/pipeline.ts
  T002 — src/types/pull-request.ts
  T003 — tests/integration/helpers/integration-utils.ts

Parallel batch 2 (US1 helpers):
  T004 — buildPullRequestBuildsUrl (pr-client.ts)
  T005 — mapBuildToCheckState (pr-client.ts)

Sequential:
  T006 — getPullRequestBuilds (pr-client.ts) [needs T004, T005]
  T007 — buildPullRequestStatusEntry update (pr.ts) [needs T006]

Parallel batch 3:
  T008 — integration test (pull-requests.test.ts)
  T009 — mapPolicyEvaluationCheck isBlocking (pr-client.ts)
  T010 — formatPullRequestChecks [optional] tag (pr.ts)
```

---

## TDD Strategy

No explicit TDD requested in spec. Integration tests (T008, T011) cover the end-to-end observable contract. Unit tests for individual mapping functions are not included unless specifically requested.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational type changes (T001–T003)
2. Complete Phase 3: US1 — `getPullRequestBuilds` + wiring (T004–T008)
3. **STOP and VALIDATE**: Run `azdo pr status` on PR #65 — checks must appear
4. Run `npm run test:integration` with `AZDO_PR_ID_WITH_BUILDS=65` — must pass

### Incremental Delivery

1. Foundation (T001–T003) → Types ready
2. US1 (T004–T008) → Core bug fixed; PR #65 shows checks ✅
3. US2 (T009–T010) → Optional checks labeled ✅
4. US3 (T011) → JSON output verified ✅
5. Polish (T012–T013) → Lint/tests clean; README updated ✅

---

## Notes

- [P] tasks = different files, no shared state, safe to parallelize
- T004 + T005 can be authored before T006 but T006 must import/use both
- The dedup mechanism (excluding builds already linked by policy evaluations via `context.buildId`) is described in `data-model.md` as an enhancement but is **not** a blocking requirement for the P1 fix. It can be added as a follow-up if the owner reports duplicates in practice.
- `isBlocking: null` for build-source checks is intentional — the Builds API has no policy blocking metadata. Only policy-source checks carry `true`/`false`.
