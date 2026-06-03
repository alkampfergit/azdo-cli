# Feature Specification: `azdo pipeline` command group

**Feature Branch**: `024-azdo-pipeline`  
**Created**: 2026-06-03  
**Status**: Draft  
**Input**: User description (issue #51): a new `azdo pipeline` command group with `list`, `get-runs <def_id>`, `get-run-detail <run_id>`, and `start <def_id>`, plus a request to research the Azure DevOps Pipelines REST API and propose additional, coherent features.

## Overview

Introduce a new top-level command group, `azdo pipeline`, that lets users
inspect and operate Azure DevOps pipelines from the CLI — listing pipeline
definitions, reviewing recent runs, drilling into a single run's outcome
(including errors and failing tests), and queuing new runs. The owner asked
for API research and feature proposals; this spec includes the four
owner-requested subcommands as the committed scope plus a clearly separated
**Proposed Extensions** section the owner can accept or trim before planning.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - List pipeline definitions (Priority: P1)

A user wants to discover which pipelines exist in the project and find a
specific one's id (needed by the other subcommands).

**Why this priority**: Every other subcommand needs a definition id or run id;
listing is the entry point and the smallest useful slice.

**Independent Test**: Run `azdo pipeline list` in a project with pipelines and
confirm each definition's id and name are shown; `--filter <name>` narrows the
list by name.

**Acceptance Scenarios**:

1. **Given** a project with one or more pipeline definitions, **When** the user
   runs `azdo pipeline list`, **Then** each definition is listed with at least
   its numeric id and name.
2. **Given** the same project, **When** the user runs `azdo pipeline list
   --filter <text>`, **Then** only definitions whose name matches `<text>`
   (case-insensitive substring) are shown.
3. **Given** a project with no pipelines, **When** the user runs `azdo pipeline
   list`, **Then** a clear "no pipelines found" message is shown (exit 0).
4. **Given** `--json`, **When** the user runs the command, **Then** the
   definitions are emitted as a JSON array.

---

### User Story 2 - List recent runs for a pipeline (Priority: P1)

A user has a definition id and wants to see its most recent runs and their
outcomes.

**Why this priority**: This is the day-to-day "did my pipeline pass?" view and
supplies the run ids needed by `get-run-detail`.

**Independent Test**: Run `azdo pipeline get-runs <def_id>` and confirm recent
runs are listed newest-first with id, state/result, and timestamp; `--limit
<n>` caps the count.

**Acceptance Scenarios**:

1. **Given** a definition with run history, **When** the user runs `azdo
   pipeline get-runs <def_id>`, **Then** recent runs are listed newest-first,
   each with run id, status/result, and a timestamp.
2. **Given** the same definition, **When** the user passes `--limit <n>`,
   **Then** at most `n` runs are returned.
3. **Given** a definition id that does not exist, **When** the user runs the
   command, **Then** a clear "not found" error is shown with a non-zero exit.
4. **Given** a definition with no runs, **When** the user runs the command,
   **Then** a clear "no runs" message is shown (exit 0).

---

### User Story 3 - Inspect a single run in detail (Priority: P1)

A user wants a good, readable summary of one run: when it ran, what commit was
built, whether it succeeded or failed, the list of errors, and — if tests ran —
how many tests failed.

**Why this priority**: This is the core diagnostic value of the feature — the
"why did it fail?" view the issue emphasises.

**Independent Test**: Run `azdo pipeline get-run-detail <run_id>` for a failed
run and confirm the summary shows execution date, built commit, overall
result, the errors, and the failing-test count.

**Acceptance Scenarios**:

1. **Given** a completed run, **When** the user runs `azdo pipeline
   get-run-detail <run_id>`, **Then** the output includes: execution date(s),
   the built commit (id/branch), overall success/failure result, and a list of
   errors (if any).
2. **Given** a run whose pipeline executed tests, **When** the user views its
   detail, **Then** the number of failing tests is reported (0 when all
   passed).
3. **Given** a run with no test execution, **When** the user views its detail,
   **Then** the test section indicates tests were not present rather than
   showing a misleading "0 failures".
4. **Given** a successful run, **When** the user views its detail, **Then** the
   result is shown as succeeded and the error list is empty.
5. **Given** `--json`, **When** the user runs the command, **Then** the same
   information is available as structured fields.

---

### User Story 4 - Queue a new pipeline run (Priority: P2)

A user wants to start (queue) a pipeline run from the CLI, optionally for a
specific branch.

**Why this priority**: Valuable but a state-changing action and dependent on
knowing a definition id (US1); slightly lower than the read views.

**Independent Test**: Run `azdo pipeline start <def_id> --branch <branch>` and
confirm a new run is queued and its run id/link is returned.

**Acceptance Scenarios**:

1. **Given** a valid definition id, **When** the user runs `azdo pipeline start
   <def_id>`, **Then** a new run is queued against the pipeline's default
   branch and the new run id (and link) is returned.
2. **Given** `--branch <branchname>`, **When** the user starts the pipeline,
   **Then** the run is queued for that branch.
3. **Given** an invalid definition id or a branch that does not exist, **When**
   the user runs the command, **Then** a clear error is shown with a non-zero
   exit and no run is queued.

---

### Edge Cases

- A definition id or run id that is not a positive integer → validation error,
  non-zero exit, no API call (mirrors the existing `--pr-number` validation).
- A run still in progress in `get-run-detail` → show the in-progress state;
  errors/tests may be partial or absent; do not present it as a final result.
- A run that built from a non-Git source or where commit info is unavailable →
  show "commit: unavailable" rather than failing.
- Pagination: definitions/runs lists may exceed one API page; `--limit` bounds
  runs, and the list commands must not silently truncate without indicating
  more exist.
- Insufficient permissions / auth failure → reuse the existing auth-error
  handling (clear message, non-zero exit), never a stack trace.
- `pipeline start` on a project where the user lacks queue permissions → clear
  permission error, non-zero exit.

## Requirements *(mandatory)*

### Functional Requirements — committed scope (owner-requested)

- **FR-001**: The CLI MUST provide a `pipeline` command group with subcommands
  `list`, `get-runs`, `get-run-detail`, and `start`.
- **FR-002**: `pipeline list` MUST list pipeline definitions showing at least
  id and name, and MUST accept `--filter <name>` for case-insensitive
  substring filtering by name.
- **FR-003**: `pipeline get-runs <def_id>` MUST list recent runs for the
  definition newest-first, each with run id, status/result, and timestamp, and
  MUST accept `--limit <n>` to cap the number returned.
- **FR-004**: `pipeline get-run-detail <run_id>` MUST present a summary
  including execution date, the built commit, overall success/failure result,
  and the list of errors for the run.
- **FR-005**: `pipeline get-run-detail` MUST report the number of failing tests
  when the run executed tests, and MUST clearly distinguish "no tests" from
  "zero failures".
- **FR-006**: `pipeline start <def_id>` MUST queue a new run and return the new
  run id (and link), and MUST accept `--branch <branchname>` to target a
  branch.
- **FR-007**: Every subcommand MUST support `--json` output in addition to
  human-readable output (constitution: CLI-first).
- **FR-008**: All subcommands MUST validate numeric id arguments and surface
  not-found / auth / permission errors with clear messages and meaningful exit
  codes, reusing the project's existing error-handling conventions.
- **FR-009**: All subcommands MUST honour the existing org/project resolution
  (`--org` / `--project` and configured defaults) used by other commands.

### Functional Requirements — Proposed Extensions *(owner to accept/trim before planning)*

These are proposed based on the Azure DevOps Pipelines REST API research. Each
is independently droppable; none is committed until the owner approves.

- **FR-P1 (logs)**: `pipeline logs <run_id>` to list a run's logs and fetch a
  specific log by id — directly supports diagnosing failures surfaced by
  `get-run-detail`. *(Proposed, P2)*
- **FR-P2 (cancel)**: `pipeline cancel <run_id>` to cancel an in-progress run.
  State-changing. *(Proposed, P3)*
- **FR-P3 (parameters on start)**: `pipeline start` accepts `--parameter
  key=value` (repeatable) to pass template parameters/variables to the queued
  run. *(Proposed, P3)*
- **FR-P4 (richer detail)**: `get-run-detail` additionally shows per-stage/job
  status and a web link to the run in the Azure DevOps UI. *(Proposed, P2)*
- **FR-P5 (get one definition)**: `pipeline get <def_id>` to show a single
  definition's metadata (folder, latest run, default branch). *(Proposed, P3)*

### Naming decision (owner input requested)

- **D-1**: The issue wrote `pipeline lists`; this spec proposes `pipeline list`
  for consistency with the rest of the CLI (singular verb, like `comments
  list`). The owner can keep `list`, revert to `lists`, or request an alias.

### Key Entities *(include if data involved)*

- **Pipeline definition**: A configured pipeline — numeric id, name, optional
  folder, default branch.
- **Pipeline run**: One execution of a definition — run id, state (in
  progress/completed), result (succeeded/failed/canceled), created/finished
  timestamps, the source commit/branch that was built.
- **Run error**: A diagnostic emitted by a run's tasks/stages (message, and
  ideally the stage/job/task it came from).
- **Test summary**: Aggregate test outcome for a run — total/failed counts, or
  an indication that no tests were present.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can discover a pipeline's id and then view its latest runs
  using only `azdo pipeline list` and `azdo pipeline get-runs <id>` — no need to
  open the Azure DevOps web UI.
- **SC-002**: For a failed run, `azdo pipeline get-run-detail <run_id>` shows
  the result, at least one actionable error, and the failing-test count (when
  tests ran) in a single command.
- **SC-003**: `azdo pipeline start <def_id> --branch <branch>` queues a run and
  returns its id within one command, verifiable by a subsequent `get-runs`.
- **SC-004**: Every subcommand returns valid, parseable JSON under `--json`
  containing the same information shown in human-readable mode.
- **SC-005**: Invalid ids and permission/auth failures produce a clear message
  and a non-zero exit with no stack trace, for every subcommand.

## Assumptions

- "Definition id" = the numeric pipeline id from `pipeline list`; "run id" =
  the numeric run id from `get-runs`.
- Run errors and failing-test counts are sourced from the run's
  timeline/diagnostics and test results; the exact data sources are an
  implementation concern resolved in planning. If a source is unavailable for a
  given run, the command degrades gracefully (shows "unavailable") rather than
  failing.
- `--filter` is a case-insensitive substring match on the definition name.
- `get-runs` default ordering is newest-first; a sensible default `--limit`
  (e.g. 10) applies when the flag is omitted (exact default confirmed in
  planning).
- These commands read/operate the caller's authorised projects only; no new
  credential type or scope beyond what `azdo` already uses.
- The Proposed Extensions are out of committed scope until the owner approves
  them on the issue.
