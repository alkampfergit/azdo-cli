# Feature Specification: `azdo pipeline` command group

**Feature Branch**: `024-azdo-pipeline`  
**Created**: 2026-06-03  
**Status**: Draft (rev 2 — incorporates owner feedback: `wait` subcommand + AI-agent focus)  
**Input**: User description (issue #51): a new `azdo pipeline` command group; the owner asked for API research, an explicit committed feature list, an **AI-coding-agent** focus (commit → push → build → wait → get errors → repeat), and a `pipeline wait <run_id>` subcommand.

## Overview

Introduce a new top-level command group, `azdo pipeline`, that lets a human —
**or an AI coding agent** — inspect and operate Azure DevOps pipelines from the
CLI: list definitions, review runs, wait for a run to finish, drill into a
run's outcome (errors and failing tests), fetch logs, and queue new runs.

The naming decision is resolved: the verb is **`list`** (singular), consistent
with the rest of the CLI.

## Primary motivating workflow — the AI coding-agent loop

An automated coding agent (and many humans) repeat this loop:

> **commit → push → a build runs → wait for it to finish → read the errors / failing tests → fix → repeat**

This feature makes that loop fully scriptable without leaving the terminal:

1. The agent pushes a commit (a CI build is triggered, or the agent queues one
   with `pipeline start`).
2. `azdo pipeline get-runs <def_id> --branch <branch> --limit 1 --json` finds
   the run that was triggered for that branch.
3. `azdo pipeline wait <run_id>` blocks until the run finishes and **exits 0 on
   success, non-zero on failure/cancel/timeout** — so the agent can branch on
   the exit code.
4. On failure, `azdo pipeline get-run-detail <run_id> --json` returns the
   errors and failing-test count; `azdo pipeline logs <run_id>` fetches the
   failing log for deeper diagnosis.
5. The agent fixes and repeats.

Every subcommand supports `--json` so an agent can parse results
deterministically (FR-007).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - List pipeline definitions (Priority: P1)

Discover which pipelines exist and find a definition's id.

**Independent Test**: `azdo pipeline list` shows each definition's id + name;
`--filter <name>` narrows by case-insensitive substring.

**Acceptance Scenarios**:
1. **Given** a project with pipelines, **When** `azdo pipeline list`, **Then**
   each definition shows at least id and name.
2. **Given** `--filter <text>`, **Then** only name-matching definitions appear.
3. **Given** no pipelines, **Then** a clear "no pipelines found" message (exit 0).
4. **Given** `--json`, **Then** definitions are emitted as a JSON array.

---

### User Story 2 - List recent runs for a pipeline (Priority: P1)

See a definition's recent runs and outcomes, and locate the run triggered for a
particular branch.

**Independent Test**: `azdo pipeline get-runs <def_id>` lists runs newest-first
with id, state/result, timestamp; `--limit <n>` caps count; `--branch <branch>`
restricts to runs for that branch.

**Acceptance Scenarios**:
1. **Given** a definition with history, **When** `get-runs <def_id>`, **Then**
   runs are listed newest-first with id, status/result, timestamp.
2. **Given** `--limit <n>`, **Then** at most `n` runs are returned.
3. **Given** `--branch <branch>`, **Then** only runs for that branch are shown
   (supports the AI-agent loop's "find the run my push triggered").
4. **Given** a non-existent definition id, **Then** a clear not-found error,
   non-zero exit.
5. **Given** `--json`, **Then** runs are emitted as a JSON array.

---

### User Story 3 - Wait for a run to finish (Priority: P1) — owner-requested

Block until a run reaches a terminal state, with an exit code that reflects the
outcome — the lynchpin of the automated loop.

**Why this priority**: Explicitly requested; without it the agent must busy-poll
`get-runs` itself. The exit-code contract is what makes the whole loop
scriptable.

**Independent Test**: `azdo pipeline wait <run_id>` on an in-progress run
returns only once the run completes, with exit 0 for success and non-zero for
failure/cancel/timeout.

**Acceptance Scenarios**:
1. **Given** an in-progress run, **When** `azdo pipeline wait <run_id>`, **Then**
   the command blocks (polling) until the run reaches a terminal state, then
   prints the final result.
2. **Given** a run that ends **succeeded**, **Then** the command exits `0`.
3. **Given** a run that ends **failed or canceled**, **Then** the command exits
   non-zero, with the result distinguishable (in text and `--json`).
4. **Given** `--timeout <seconds>` that elapses before the run finishes,
   **Then** the command stops waiting and exits non-zero with a distinct
   "timed out" indication (the run itself is not canceled).
5. **Given** an already-finished run, **Then** the command returns immediately
   with that result and the corresponding exit code.
6. **Given** `--json`, **Then** the final run state/result is emitted as
   structured output.

---

### User Story 4 - Inspect a single run in detail (Priority: P1)

A readable summary of one run: when it ran, the built commit, success/failure,
the errors, the failing-test count, per-stage status, and a web link.

**Independent Test**: `azdo pipeline get-run-detail <run_id>` for a failed run
shows execution date, built commit, result, errors, failing-test count,
per-stage status, and a link.

**Acceptance Scenarios**:
1. **Given** a completed run, **Then** the output includes execution date(s),
   built commit (id/branch), overall result, and the list of errors (if any).
2. **Given** a run that executed tests, **Then** the number of failing tests is
   reported (0 when all passed).
3. **Given** a run with no test execution, **Then** the test section indicates
   tests were not present (not a misleading "0 failures").
4. **Given** any run, **Then** per-stage/job status and a web link to the run
   are shown.
5. **Given** `--json`, **Then** the same information is available as structured
   fields.

---

### User Story 5 - Fetch run logs (Priority: P2)

Retrieve a run's logs to diagnose a failure beyond the summarised errors.

**Independent Test**: `azdo pipeline logs <run_id>` lists the run's logs;
`--log-id <id>` prints a specific log's content.

**Acceptance Scenarios**:
1. **Given** a run, **When** `azdo pipeline logs <run_id>`, **Then** the
   available logs are listed (id + reference).
2. **Given** `--log-id <id>`, **Then** that log's content is written to stdout.
3. **Given** `--json`, **Then** the log list is emitted as structured output.

---

### User Story 6 - Queue a new pipeline run (Priority: P2)

Start a run from the CLI, optionally for a branch and with template parameters.

**Independent Test**: `azdo pipeline start <def_id> --branch <branch>` queues a
run and returns its id/link; `--parameter k=v` passes template parameters.

**Acceptance Scenarios**:
1. **Given** a valid definition id, **When** `azdo pipeline start <def_id>`,
   **Then** a run is queued against the default branch and the new run id (and
   link) is returned.
2. **Given** `--branch <branch>`, **Then** the run targets that branch.
3. **Given** `--parameter key=value` (repeatable), **Then** those template
   parameters are passed to the run.
4. **Given** an invalid id or branch, **Then** a clear error, non-zero exit, no
   run queued.
5. **Given** `--json`, **Then** the queued run is emitted as structured output
   (so an agent can pipe the id straight into `pipeline wait`).

---

### Edge Cases

- Non-integer id argument → validation error, non-zero exit, no API call
  (mirrors existing `--pr-number` validation).
- `wait` on a run that never finishes → bounded by `--timeout`; a sensible
  default timeout applies; polling interval is bounded to avoid hammering the
  API.
- `get-run-detail` / `wait` on an in-progress run → show in-progress state;
  errors/tests may be partial; never present as final.
- Run built from a non-Git source or missing commit info → show "commit:
  unavailable" rather than failing.
- List pagination: must not silently truncate without indicating more exist;
  `--limit` bounds `get-runs`.
- Auth / permission failures → reuse existing clear-message, non-zero-exit
  handling; never a stack trace.

## Requirements *(mandatory)*

### Functional Requirements — committed scope

- **FR-001**: Provide a `pipeline` command group with subcommands `list`,
  `get-runs`, `wait`, `get-run-detail`, `logs`, and `start`.
- **FR-002**: `pipeline list` MUST list definitions (id + name) and accept
  `--filter <name>` (case-insensitive substring).
- **FR-003**: `pipeline get-runs <def_id>` MUST list recent runs newest-first
  (id, status/result, timestamp), and accept `--limit <n>` and `--branch
  <branch>` (filter to a branch's runs).
- **FR-004**: `pipeline wait <run_id>` MUST block until the run reaches a
  terminal state and MUST set its **process exit code from the run result**:
  `0` for succeeded; non-zero for failed/canceled; a distinct non-zero for
  `--timeout` elapsed. It MUST accept `--timeout <seconds>` and use a bounded
  polling interval (configurable via `--poll-interval <seconds>`, with a sane
  default).
- **FR-005**: `pipeline get-run-detail <run_id>` MUST present execution date,
  built commit, overall result, the list of errors, per-stage/job status, and a
  web link to the run.
- **FR-006**: `get-run-detail` MUST report the number of failing tests when the
  run executed tests, and MUST distinguish "no tests" from "zero failures".
- **FR-007**: `pipeline logs <run_id>` MUST list a run's logs and, with
  `--log-id <id>`, print a specific log's content.
- **FR-008**: `pipeline start <def_id>` MUST queue a run and return the new run
  id (and link), accepting `--branch <branchname>` and repeatable `--parameter
  key=value` template parameters.
- **FR-009**: Every subcommand MUST support `--json` output alongside
  human-readable output (constitution: CLI-first; required for AI-agent use).
- **FR-010**: All subcommands MUST validate numeric id arguments and surface
  not-found / auth / permission errors with clear messages and meaningful exit
  codes, reusing existing conventions.
- **FR-011**: All subcommands MUST honour existing org/project resolution
  (`--org` / `--project` and configured defaults).

### Functional Requirements — Proposed Extensions *(owner to accept/trim)*

- **FR-P1 (cancel)**: `pipeline cancel <run_id>` to cancel an in-progress run.
  State-changing. *(Proposed, P3)*
- **FR-P2 (get one definition)**: `pipeline get <def_id>` to show a single
  definition's metadata (folder, default branch, latest run). *(Proposed, P3)*

### Resolved decisions

- **D-1 (naming)**: ✅ The verb is `list` (singular), per owner approval.

### Key Entities *(include if data involved)*

- **Pipeline definition**: numeric id, name, optional folder, default branch.
- **Pipeline run**: run id, state (in progress/completed), result
  (succeeded/failed/canceled), created/finished timestamps, built commit/branch.
- **Run error**: a diagnostic from a run's tasks/stages (message + originating
  stage/job/task where available).
- **Stage/job status**: per-stage/job state + result within a run.
- **Test summary**: total/failed test counts, or "no tests present".
- **Run log**: a log stream produced by a run (id + content).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user/agent can go from "which pipeline?" to "its latest runs"
  using only `azdo pipeline list` + `azdo pipeline get-runs <id>` — no web UI.
- **SC-002**: An AI agent can run the full loop headlessly: `start` (or detect
  via `get-runs --branch`) → `wait` → branch on exit code → `get-run-detail` on
  failure — all with `--json`, no human in the loop.
- **SC-003**: `azdo pipeline wait <run_id>` exits `0` for a succeeded run and
  non-zero for a failed/canceled/timed-out run, verifiable by `echo $?`.
- **SC-004**: For a failed run, `get-run-detail` shows the result, ≥1 actionable
  error, and the failing-test count (when tests ran) in one command.
- **SC-005**: Every subcommand returns valid, parseable JSON under `--json`
  with the same information as human-readable mode.
- **SC-006**: Invalid ids and permission/auth failures produce a clear message
  and non-zero exit with no stack trace, for every subcommand.

## Assumptions

- "Definition id" = numeric pipeline id from `pipeline list`; "run id" = numeric
  run id from `get-runs`.
- `wait` default timeout and poll interval are sane bounded defaults (exact
  values confirmed in planning); polling never busy-loops the API.
- Run errors, per-stage status, and failing-test counts come from the run's
  timeline/diagnostics and test results; exact sources are an implementation
  concern resolved in planning. Unavailable data degrades to "unavailable"
  rather than failing.
- `--filter` is a case-insensitive substring match on the definition name;
  `get-runs --branch` matches the run's source branch.
- No new credential type or scope beyond what `azdo` already uses.
- `cancel` and `get` (FR-P1/FR-P2) remain out of committed scope until the owner
  approves them.
