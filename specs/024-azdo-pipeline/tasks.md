---
description: "Task list for feature 024-azdo-pipeline"
---

# Tasks: `azdo pipeline` command group

**Input**: Design documents from `/specs/024-azdo-pipeline/` · **Issue**: #51
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/cli-commands.md

**Tests**: TDD requested — vitest unit tests written with each slice.

**Organization**: By user story — US1 list · US2 get-runs · US3 wait · US4 get-run-detail · US5 logs · US6 start.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: parallelizable (different file / no incomplete dependency). Single-project layout: `src/`, `tests/`.

---

## Phase 1: Setup

- [ ] T001 Confirm baseline green on branch `024-azdo-pipeline`: `npm run lint && npm test && npm run build`.

---

## Phase 2: Foundational (blocking prerequisites)

- [ ] T002 Create `src/types/pipeline.ts` with raw ADO shapes (`AzdoPipelineListResponse`, `AzdoPipeline`, `AzdoRunListResponse`, `AzdoRun`, `AzdoBuild`, `AzdoTimeline`/`AzdoTimelineRecord`, `AzdoTestResultSummary`, `AzdoRunLogListResponse`/`AzdoRunLog`) and domain types from data-model.md (`PipelineDefinition`, `PipelineRunSummary`, `PipelineRunDetail`, `PipelineRunError`, `PipelineStageStatus`, `TestSummary`, `PipelineWaitResult`, `PipelineLog`, `PipelineStartResult`). No `any`.
- [ ] T003 Create `src/services/pipeline-client.ts` skeleton: URL builders for org/project endpoints (pipelines, runs, build, timeline, test results, logs) reusing `authHeaders`/`fetchWithErrors`/`readJsonResponse` patterns from `pr-client.ts`; export stubs to be filled per story.
- [ ] T004 Create `src/commands/pipeline.ts` skeleton: `createPipelineCommand()` returning a `pipeline` Command group (modelled on `createPrCommand()` in `src/commands/pr.ts:714`); add a shared positive-integer id parser (reuse the `parsePositivePrNumber` pattern) and a shared org/project resolver call. Register in `src/index.ts` via `program.addCommand(createPipelineCommand())`.

**Checkpoint**: `npx tsc --noEmit` clean; `azdo pipeline --help` lists the (empty) group.

---

## Phase 3: User Story 1 — list (P1) 🎯 MVP

- [ ] T005 [P] [US1] Test: `tests/unit/pipeline-client.test.ts` — `getPipelineDefinitions` maps `GET _apis/pipelines` payload → `PipelineDefinition[]` (mocked fetch). (Fails first.)
- [ ] T006 [P] [US1] Test: `tests/unit/pipeline.test.ts` — `pipeline list` renders id+name, `--filter` substring (case-insensitive), empty message, `--json` array.
- [ ] T007 [US1] Implement `getPipelineDefinitions(context, cred)` in `pipeline-client.ts`.
- [ ] T008 [US1] Implement `pipeline list` subcommand in `pipeline.ts` (`--filter`, `--json`, empty handling). Verify T005/T006.

**Checkpoint**: `azdo pipeline list` works — MVP.

---

## Phase 4: User Story 2 — get-runs (P1)

- [ ] T009 [P] [US2] Test (client): `getPipelineRuns` maps `GET _apis/pipelines/{id}/runs` → `PipelineRunSummary[]` (newest-first, sourceBranch extracted).
- [ ] T010 [P] [US2] Test (command): `get-runs <def_id>` honours `--limit`, `--branch` filter, id validation, not-found, no-runs, `--json`.
- [ ] T011 [US2] Implement `getPipelineRuns(context, cred, defId)` in `pipeline-client.ts`.
- [ ] T012 [US2] Implement `pipeline get-runs` subcommand (`--limit`, `--branch`, `--json`). Verify T009/T010.

**Checkpoint**: `azdo pipeline get-runs <id> --branch <b> --limit 1` works.

---

## Phase 5: User Story 3 — wait (P1, owner lynchpin)

- [ ] T013 [P] [US3] Test (client): `getBuildStatus(buildId)` maps `GET _apis/build/builds/{id}` → `{state, result}`.
- [ ] T014 [P] [US3] Test (command): `wait` exit-code mapping — succeeded→0, failed/canceled→non-zero, timeout→distinct (e.g. 124); honours `--poll-interval`/`--timeout`; `--json` carries `state`/`result`/`timedOut`. (Mock the client; mock timers so no real sleeping.)
- [ ] T015 [US3] Implement `getBuildStatus(context, cred, buildId)` in `pipeline-client.ts`.
- [ ] T016 [US3] Implement `pipeline wait` subcommand: bounded polling loop (default interval 5s, default timeout 1800s), maps result → `process.exitCode`; does NOT cancel on timeout; `--json`. Verify T013/T014.

**Checkpoint**: `azdo pipeline wait <run_id>; echo $?` reflects the result.

---

## Phase 6: User Story 4 — get-run-detail (P1)

- [ ] T017 [P] [US4] Test (client): `getBuildTimeline` maps timeline → `PipelineRunError[]` (issues type=error) + `PipelineStageStatus[]` (Stage records); `getTestSummary` maps Test Results → `TestSummary` (present/total/failed, "no tests" when absent).
- [ ] T018 [P] [US4] Test (command): `get-run-detail` composes core+timeline+tests; "no tests present" ≠ "0 failures"; a failing source degrades to "unavailable" not a crash; `--json` shape.
- [ ] T019 [US4] Implement `getRun`/build-core, `getBuildTimeline`, `getTestSummary` in `pipeline-client.ts`.
- [ ] T020 [US4] Implement `pipeline get-run-detail` subcommand: compose the three sources with per-source try/catch → "unavailable"; render date, commit, result, errors, stages, web link, test summary; `--json`. Verify T017/T018.

**Checkpoint**: `azdo pipeline get-run-detail <run_id>` shows errors + failing tests.

---

## Phase 7: User Story 5 — logs (P2)

- [ ] T021 [P] [US5] Test (client): `getRunLogs` lists logs; `getRunLog` fetches one log's content.
- [ ] T022 [US5] Implement `getRunLogs`/`getRunLog` in `pipeline-client.ts` and the `pipeline logs` subcommand (`--log-id`, `--json`). Verify T021.

**Checkpoint**: `azdo pipeline logs <run_id> --log-id <id>` prints log content.

---

## Phase 8: User Story 6 — start (P2)

- [ ] T023 [P] [US6] Test (client): `runPipeline` POSTs the correct body (`resources.repositories.self.refName` from `--branch`; `templateParameters` from `--parameter`).
- [ ] T024 [P] [US6] Test (command): `start` parses repeated `--parameter k=v`, `--branch`; returns/serialises the new run id; invalid id/branch error path.
- [ ] T025 [US6] Implement `runPipeline(context, cred, defId, {branch, parameters})` in `pipeline-client.ts`.
- [ ] T026 [US6] Implement `pipeline start` subcommand (`--branch`, repeatable `--parameter`, `--json`). Verify T023/T024.

**Checkpoint**: `azdo pipeline start <def_id> --branch <b> --json | jq .id` → pipe into `wait`.

---

## Phase 9: Polish & cross-cutting

- [ ] T027 [P] Document the `pipeline` group in `docs/commands.md` (command table row + per-subcommand section incl. the `wait` exit-code contract).
- [ ] T028 [P] Update `README.md` per constitution (pipeline examples incl. the AI-agent loop).
- [ ] T029 Finalise the PR report (`specs/024-azdo-pipeline/pr-report.md`) — done in speckit-gh step 11.
- [ ] T030 Full gate: `npm run lint && npm test && npm run build` all green; quickstart spot-check if a live ADO project is available.

---

## Dependencies & order

- Setup (T001) → Foundational (T002–T004) → stories.
- **MVP = US1 (list).** US2–US6 each depend only on Foundational and are independently testable; US3 (wait) and US4 (detail) are the highest-value AI-agent pieces.
- Within each story: tests (TDD) precede implementation; client function precedes the subcommand that uses it.
- Polish (T027–T030) last.

## Parallel execution examples
- Test tasks across stories (T005/T009/T013/T017/T021/T023) are in 2 shared test files — group by file to avoid write races (`pipeline-client.test.ts` vs `pipeline.test.ts`), or write sequentially within a file.
- Docs T027/T028 parallel.

## Implementation strategy
1. Foundational scaffolding (types, service skeleton, command group registered).
2. Ship US1 (list) → US2 (get-runs) → **US3 (wait)** + **US4 (get-run-detail)** (the agent loop) → US5 (logs) → US6 (start).
3. Polish docs + final gate.
