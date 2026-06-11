# PR Report: `azdo pipeline` command group

**Branch**: `024-azdo-pipeline`
**Date**: 2026-06-03
**Spec**: [specs/024-azdo-pipeline/spec.md](./spec.md)

## Summary

Adds a new `azdo pipeline` command group for Azure DevOps Pipelines — list
definitions, inspect recent runs, **wait** for a run to finish (with a
result-reflecting process exit code), drill into a run's errors/failing-tests/
stages, fetch logs, and queue runs. Designed for the AI-coding-agent loop
(push → build → wait → read errors → repeat) with `--json` on every subcommand.
Closes #51.

## What's New

- **`pipeline list`**: lists pipeline definitions (id + name + folder), with
  `--filter <name>` (case-insensitive substring).
- **`pipeline get-runs <def_id>`**: recent runs newest-first (id, state/result,
  timestamp, branch); `--limit <n>` and `--branch <branch>` to find the run a
  push triggered.
- **`pipeline wait <run_id>`**: blocks until the run is terminal and sets the
  **process exit code from the result** — `0` succeeded, `1` failed, `2`
  canceled, `124` on `--timeout` (bounded polling via `--poll-interval`; a
  timeout does not cancel the run). This is the scriptable lynchpin of the
  agent loop.
- **`pipeline get-run-detail <run_id>`**: composes the run core (date, built
  commit, result, web link) + Build **timeline** (errors + per-stage status) +
  **test results** (failing/total). Reports "no tests present" distinctly from
  "0 failures", and degrades any unavailable source to "unavailable" instead of
  failing.
- **`pipeline logs <run_id>`**: lists a run's logs; `--log-id <id>` prints one.
- **`pipeline start <def_id>`**: queues a run; `--branch <branch>` and repeatable
  `--parameter key=value` (template parameters); returns the new run id + link.
- **`--json` on every subcommand**; new `src/commands/pipeline.ts`,
  `src/services/pipeline-client.ts`, `src/types/pipeline.ts`; registered in
  `src/index.ts`. Docs added to `docs/commands.md` and `README.md`.

## New Libraries / Dependencies

None — uses the existing commander.js + native `fetch` stack and the shared
`authHeaders`/`fetchWithErrors`/`resolveContext` helpers.

## Testing

- **Unit (vitest)** — `tests/unit/pipeline-client.test.ts`: REST mapping per
  endpoint against mocked `fetch` (pipelines list, runs incl. branch/state,
  build status incl. `partiallySucceeded`→failed, timeline→errors+stages, test
  summary present/absent, `start` POST body, logs list, auth error
  propagation).
- **Unit (vitest)** — `tests/unit/pipeline.test.ts`: command behaviour —
  `list` filter/empty/json, `get-runs` limit/branch/id-validation, **`wait`
  exit-code mapping** (0/1/2/124, no real sleeping), `get-run-detail` errors +
  failing tests + "no tests" vs "0 failures" + graceful "unavailable", `logs`,
  and `start` repeated `--parameter` parsing.
- **Gate**: `npm run lint` clean, `npx tsc --noEmit` clean, `npm test` = 794
  passed / 7 pre-existing skips, `npm run build` clean. `azdo pipeline --help`
  verified on the built bundle.

## Notes

- **Out of committed scope** (proposed, deferred per owner): `pipeline cancel`
  and `pipeline get <def_id>`.
- `run id` is treated as the build id for the Build-API-backed subcommands
  (wait/detail/logs) — true for YAML pipelines; documented in research.md.
- Errors and failing-test counts come from the Build Timeline and Test Results
  APIs; on a run where those are unavailable, the detail view shows
  "unavailable" for that section rather than failing.
- Not exercised against a live Azure DevOps instance in CI (no org creds in the
  test environment); `quickstart.md` provides manual verification steps.
