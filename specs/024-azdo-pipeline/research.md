# Research: `azdo pipeline` command group (024)

**Feature**: 024-azdo-pipeline · **Issue**: #51 · **Date**: 2026-06-03

Resolves the technical unknowns for the `pipeline` command group, grounded in
the Azure DevOps REST API (api-version 7.1) and the existing codebase. Web
research was performed at the owner's explicit request.

---

## R1 — Listing pipeline definitions (US1)

**Decision.** `GET https://dev.azure.com/{org}/{project}/_apis/pipelines?api-version=7.1`
returns `{ value: [{ id, name, folder, ... }] }`. `--filter` is applied
client-side as a case-insensitive substring on `name` (the list endpoint has no
name-filter parameter). Pagination via `continuationToken` header/`$top`; the
list command surfaces "more available" rather than silently truncating.

**Rationale.** Simplest correct source; matches the issue's "list all the
definitions, --filter by name".

---

## R2 — Listing runs for a definition (US2)

**Decision.** `GET .../_apis/pipelines/{pipelineId}/runs?api-version=7.1`
returns runs (most-recent first) with `id`, `name`, `state`
(`inProgress`/`completed`), `result` (`succeeded`/`failed`/`canceled`),
`createdDate`, `finishedDate`. `--limit` caps the slice client-side; `--branch`
filters on each run's source branch (from the run's `resources.repositories`
`refName`). When the listing endpoint omits the branch, fall back to the run's
detail; document the matching rule.

**Alternatives.** The Build API `GET _apis/build/builds?definitions={id}&branchName=...`
supports server-side branch filtering. Considered as a fallback if the
Pipelines runs endpoint proves insufficient for `--branch`; the Pipelines
endpoint is preferred for consistency with the rest of the group.

---

## R3 — Waiting for a run to finish (US3, owner-requested lynchpin)

**Decision.** Poll `GET .../_apis/pipelines/{pipelineId}/runs/{runId}` until
`state == 'completed'` (or timeout). Map `result` → process exit code:
`succeeded` → 0; `failed`/`canceled` → non-zero (distinct codes, e.g. 1 and 2);
`--timeout` elapsed → a distinct non-zero (e.g. 124, matching `timeout(1)`
convention). Poll interval defaults to a bounded value (e.g. 5s) and is
configurable via `--poll-interval`; default `--timeout` e.g. 1800s. The run is
**not** canceled on timeout.

**Note.** `wait <run_id>` needs the `pipelineId` to build the runs URL. Resolve
it from the run/build: the Build API `GET _apis/build/builds/{buildId}` returns
`definition.id`. Since run id == build id (R5), resolve pipelineId via the build
once, then poll the pipelines run endpoint. (Alternatively poll the Build API
`GET _apis/build/builds/{buildId}` directly for `status`/`result` — simpler, one
endpoint, no pipelineId needed. **Chosen: poll the Build API by build id** to
avoid a definition-id lookup in `wait`.)

**Rationale.** The exit-code contract is the whole point — it makes the agent
loop scriptable (`azdo pipeline wait $id && deploy || diagnose`).

---

## R4 — Run detail: date, commit, result, errors, failing tests, stages (US4)

**Decision.** Compose from three sources keyed by the run/build id:
1. **Run/build core** — `GET _apis/pipelines/{pipelineId}/runs/{runId}` (or
   `GET _apis/build/builds/{buildId}`) for state/result, created/finished dates,
   the built commit (`sourceVersion` / run `resources.repositories.*.version`)
   and branch, and the web link (`_links.web.href`).
2. **Errors + per-stage/job status** — **Build Timeline API**
   `GET _apis/build/builds/{buildId}/timeline?api-version=7.1`. Records have
   `type` (Stage/Phase/Job/Task), `name`, `state`, `result`, and an `issues[]`
   array (`type: error|warning`, `message`). Errors = timeline `issues` of type
   `error`; per-stage status = the Stage-type records.
3. **Failing tests** — **Test Results API**
   `GET _apis/test/ResultSummaryByBuild?buildId={buildId}&api-version=7.1` (or
   `GET _apis/test/runs?buildUri=...`) for total/failed counts. When no test
   runs are associated → report "no tests present" (distinct from 0 failures).

**run id ↔ build id.** For YAML pipelines a pipeline run corresponds 1:1 to a
build; the numeric ids coincide in practice. The plan treats `run_id` as the
build id for the timeline/test sources and documents this; if a mismatch is
ever observed, resolve via the run's `_links`/`id`.

**Graceful degradation.** Any of the three sources failing → that section shows
"unavailable" rather than failing the whole command (FR-010).

---

## R5 — Run logs (US5)

**Decision.** `GET .../_apis/pipelines/{pipelineId}/runs/{runId}/logs?api-version=7.1`
lists logs (`logs[].id`, `createdOn`, line counts). `--log-id <id>` →
`GET .../logs/{logId}?$expand=signedContent` or fetch the `url`/`signedContent`
to print the log text. Pipeline-id resolution as in R3.

---

## R6 — Starting a run (US6)

**Decision.** `POST .../_apis/pipelines/{pipelineId}/runs?api-version=7.1` with
body `{ resources: { repositories: { self: { refName: "refs/heads/<branch>" } } }, templateParameters: { <k>: <v> } }`.
`--branch` sets `refName` (default branch when omitted); `--parameter key=value`
(repeatable) populates `templateParameters`. Returns the new run (`id`, links) —
emit under `--json` so it pipes into `pipeline wait`.

---

## R7 — Codebase integration

**Decision.** Mirror the existing command/service split:
- New `src/commands/pipeline.ts` exporting `createPipelineCommand()` that groups
  subcommands (same shape as `createPrCommand()` in `src/commands/pr.ts:714`),
  registered in `src/index.ts` via `program.addCommand(createPipelineCommand())`.
- New `src/services/pipeline-client.ts` for all REST I/O, reusing
  `authHeaders` / `fetchWithErrors` from `src/services/azdo-client.ts` and
  `resolveContext` from `src/services/context.ts`, exactly as `pr-client.ts`
  does.
- New `src/types/pipeline.ts` for raw ADO shapes and domain types.
- Numeric-id validation reuses the `parsePositivePrNumber` pattern from
  `pr.ts:36`.

**Rationale.** Constitution III (shared logic in services) and consistency with
the existing PR/work-item commands. No new runtime dependency — native `fetch`
+ commander.js only.

---

## Summary of decisions

| # | Decision |
|---|----------|
| R1 | List via `_apis/pipelines`; client-side `--filter` substring. |
| R2 | Runs via `_apis/pipelines/{id}/runs`; client-side `--limit`/`--branch`. |
| R3 | `wait` polls the **Build API by build id** for state/result; exit code from result; `--timeout`/`--poll-interval`. |
| R4 | Detail composes run core + **Build Timeline** (errors, stages) + **Test Results** (failing tests); graceful degradation. |
| R5 | Logs via `_apis/pipelines/{id}/runs/{runId}/logs` (+ `{logId}`). |
| R6 | Start via `POST .../runs` with `refName` + `templateParameters`. |
| R7 | New `pipeline.ts` command + `pipeline-client.ts` service + `pipeline.ts` types; reuse existing helpers; register in `index.ts`. No new deps. |

No `NEEDS CLARIFICATION` items remain.
