# Implementation Plan: `azdo pipeline` command group

**Branch**: `024-azdo-pipeline` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/024-azdo-pipeline/spec.md` · **Issue**: #51

## Summary

Add a new `azdo pipeline` command group with six subcommands — `list`,
`get-runs`, `wait`, `get-run-detail`, `logs`, `start` — over the Azure DevOps
Pipelines/Build/Test REST APIs (api-version 7.1). Designed for an AI coding
agent's commit→push→build→**wait**→read-errors→repeat loop: `wait` blocks on a
run and maps its result to a process exit code, and every subcommand emits
`--json`. No new runtime dependencies.

## Technical Context

**Language/Version**: TypeScript 5.x (strict)
**Primary Dependencies**: commander.js, native `fetch` (no new deps)
**Storage**: N/A (stateless CLI over ADO REST)
**Testing**: vitest (`tests/unit/`)
**Target Platform**: Node.js LTS CLI bundled with tsup
**Project Type**: Single-project CLI
**Performance Goals**: Interactive; `wait` uses bounded polling (default 5s),
never busy-loops
**Constraints**: no `any`; `--json` parity on every subcommand; meaningful exit
codes (esp. `wait`); graceful degradation when a data source is unavailable
**Scale/Scope**: 1 command file, 1 service file, 1 types file, entry-point
registration, docs, unit tests

## Constitution Check

| Principle | Compliance |
|-----------|------------|
| I. CLI-First | ✅ commander.js subcommands; `--json` everywhere; meaningful exit codes (the `wait` contract is a feature). |
| II. TS Strictness | ✅ explicit types for all ADO shapes + domain types; no `any`; type guards on REST responses. |
| III. Single Responsibility | ✅ REST in `pipeline-client.ts`; parsing/formatting/exit-codes in `pipeline.ts`; one subcommand = one job. |
| IV. npm Distribution | ✅ no new runtime dependency; tsup bundle unaffected. |
| V. Simplicity | ✅ reuse `authHeaders`/`fetchWithErrors`/`resolveContext`; `wait` polls one endpoint (build-by-id); compose detail from 3 sources with graceful fallback rather than a heavy abstraction. |

**Post-design re-check**: PASS — no violations; Complexity Tracking empty.

**Workflow note**: constitution requires `README.md` review/update after the
spec run; `docs/commands.md` also updated — captured as a docs task.

## Project Structure

### Documentation (this feature)
```text
specs/024-azdo-pipeline/
├── plan.md · spec.md · research.md · data-model.md · quickstart.md
├── contracts/cli-commands.md
└── tasks.md            # /speckit.tasks (next)
```

### Source Code (repository root)
```text
src/
├── commands/
│   └── pipeline.ts          # createPipelineCommand() + 6 subcommands, --json, exit codes
├── services/
│   └── pipeline-client.ts   # REST I/O: list pipelines, list/get runs, run, logs,
│                            #   build timeline (errors+stages), test summary; poll for wait
├── types/
│   └── pipeline.ts          # Azdo* raw shapes + domain types (data-model.md)
└── index.ts                 # register: program.addCommand(createPipelineCommand())

tests/
└── unit/
    ├── pipeline-client.test.ts   # REST mapping per endpoint (mocked fetch)
    └── pipeline.test.ts          # command behaviour incl. wait exit codes, --json, validation

docs/commands.md             # document the new command group
README.md                    # constitution-required review/update
```

**Structure Decision**: Single-project CLI; mirror the `pr` command/service
split (`createPipelineCommand()` modelled on `createPrCommand()`
`src/commands/pr.ts:714`; `pipeline-client.ts` modelled on `pr-client.ts`).

## Implementation approach (per subcommand)

- **list** → `getPipelineDefinitions()` (`GET _apis/pipelines`); client-side
  `--filter`.
- **get-runs** → `getPipelineRuns(defId)` (`GET _apis/pipelines/{id}/runs`);
  client-side `--limit`/`--branch`.
- **wait** → `getBuildStatus(runId)` (`GET _apis/build/builds/{id}`) polled on
  an interval until terminal or `--timeout`; command maps result → exit code
  (0 / non-zero / 124-on-timeout). Bounded interval; no busy-loop.
- **get-run-detail** → compose `getRun()` core + `getBuildTimeline(runId)`
  (`GET _apis/build/builds/{id}/timeline` → errors + per-stage status) +
  `getTestSummary(runId)` (Test Results API → failed/total or "none"). Each
  source wrapped so a failure degrades to "unavailable".
- **logs** → `getRunLogs(defId, runId)` and `getRunLog(defId, runId, logId)`.
- **start** → `runPipeline(defId, {branch, parameters})`
  (`POST _apis/pipelines/{id}/runs`).
- Numeric-id validation reuses the `parsePositivePrNumber` pattern
  (`src/commands/pr.ts:36`).

## Testing strategy (TDD)
- `pipeline-client.test.ts`: mocked `fetch` → assert URL/verb/body and the
  mapping for each endpoint (definitions, runs, run/build, timeline→errors+stages,
  test summary, logs, start).
- `pipeline.test.ts`: command-level — `wait` exit-code mapping (success / fail /
  timeout) via mocked client; id validation; `--filter`/`--limit`/`--branch`;
  `--json` parity; "no tests present" vs "0 failures".
- Gate: `npm run lint && npm test && npm run build` green before ready.

## Complexity Tracking
No constitution violations — section intentionally empty.
