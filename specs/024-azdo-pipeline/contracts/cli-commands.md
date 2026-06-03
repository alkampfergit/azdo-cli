# CLI Contract: 024-azdo-pipeline (issue #51)

New `azdo pipeline` command group. Every subcommand supports `--org`,
`--project` (honouring configured defaults) and `--json`.

---

## `azdo pipeline list`
List pipeline definitions.
- Options: `--filter <name>` (case-insensitive substring on name).
- Human: one line per definition — `<id>  <name>  [folder]`.
- Empty: `No pipelines found.` (exit 0).
- `--json`: array of `PipelineDefinition`.

## `azdo pipeline get-runs <def_id>`
List recent runs for a definition, newest-first.
- Options: `--limit <n>` (cap; sane default e.g. 10), `--branch <branch>`
  (filter to a branch's runs).
- Human: `<runId>  [<state>/<result>]  <createdDate>  <branch>`.
- Errors: invalid id → validation error (exit non-zero, no call); unknown id →
  not-found (exit non-zero); no runs → message (exit 0).
- `--json`: array of `PipelineRunSummary`.

## `azdo pipeline wait <run_id>`
Block until the run finishes; **exit code reflects the result**.
- Options: `--timeout <seconds>` (default e.g. 1800), `--poll-interval
  <seconds>` (default e.g. 5).
- Exit codes: `0` succeeded · non-zero failed/canceled · distinct non-zero
  (e.g. 124) on timeout.
- The run is **not** canceled on timeout.
- Human: progress/terminal line. `--json`: `PipelineWaitResult`.

## `azdo pipeline get-run-detail <run_id>`
Summarise one run.
- Output includes: execution date(s), built commit + branch, overall result,
  errors (list), per-stage/job status, web link, and a test summary (failing
  count, or "no tests present").
- Graceful degradation: a missing source shows "unavailable" for that section.
- `--json`: `PipelineRunDetail`.

## `azdo pipeline logs <run_id>`
Inspect a run's logs.
- Options: `--log-id <id>` → print that log's content to stdout.
- Without `--log-id`: list logs (`id`, createdOn, lineCount).
- `--json`: array of `PipelineLog` (list) — content mode prints raw text.

## `azdo pipeline start <def_id>`
Queue a new run.
- Options: `--branch <branchname>` (default branch when omitted),
  `--parameter key=value` (repeatable → template parameters).
- Returns the new run id + link; `--json`: `PipelineStartResult`.
- Errors: invalid id/branch → clear error, non-zero exit, no run queued.

---

## Cross-cutting
- Numeric id args validated (reject non-positive-integer) before any API call.
- Auth/permission/not-found errors reuse the existing clear-message + non-zero
  exit handling; never a stack trace.
- All commands resolve org/project via the existing resolver and accept
  `--org`/`--project` overrides.

## Out of scope (proposed, not in this contract)
- `pipeline cancel <run_id>`, `pipeline get <def_id>` — deferred (owner did not
  include them in the committed set).
