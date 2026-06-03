# Data Model: `azdo pipeline` command group (024)

**Feature**: 024-azdo-pipeline · **Issue**: #51 · **Date**: 2026-06-03

New types live in `src/types/pipeline.ts`. Raw `Azdo*` shapes mirror the REST
responses; domain shapes are what the command layer renders / serialises.

---

## Domain types

### PipelineDefinition
| Field | Type | Notes |
|-------|------|-------|
| `id` | `number` | Pipeline definition id. |
| `name` | `string` | Display name (subject of `--filter`). |
| `folder` | `string \| null` | Optional folder path. |

### PipelineRunSummary  (list view — `get-runs`)
| Field | Type | Notes |
|-------|------|-------|
| `id` | `number` | Run id (== build id). |
| `name` | `string \| null` | Run name/build number. |
| `state` | `'inProgress' \| 'completed' \| 'unknown'` | Lifecycle state. |
| `result` | `'succeeded' \| 'failed' \| 'canceled' \| null` | Null while in progress. |
| `createdDate` | `string \| null` | ISO timestamp. |
| `finishedDate` | `string \| null` | ISO timestamp. |
| `sourceBranch` | `string \| null` | Built branch (for `--branch` filter). |

### PipelineRunDetail  (`get-run-detail`) — extends the summary
| Field | Type | Notes |
|-------|------|-------|
| …summary fields… | | |
| `sourceCommit` | `string \| null` | Built commit id; `null` → "unavailable". |
| `webUrl` | `string \| null` | Link to the run in the ADO UI. |
| `errors` | `PipelineRunError[]` | From the build timeline issues. |
| `stages` | `PipelineStageStatus[]` | Per-stage/job status. |
| `tests` | `TestSummary` | Failing-test count or "no tests". |

### PipelineRunError
| Field | Type | Notes |
|-------|------|-------|
| `message` | `string` | Error text. |
| `source` | `string \| null` | Originating stage/job/task name. |

### PipelineStageStatus
| Field | Type | Notes |
|-------|------|-------|
| `name` | `string` | Stage/job name. |
| `state` | `string` | e.g. completed/inProgress. |
| `result` | `string \| null` | succeeded/failed/skipped/…. |

### TestSummary
| Field | Type | Notes |
|-------|------|-------|
| `present` | `boolean` | False when the run executed no tests. |
| `total` | `number` | Total tests (0 when not present). |
| `failed` | `number` | Failing tests (0 when not present). |

### PipelineWaitResult  (`wait`)
| Field | Type | Notes |
|-------|------|-------|
| `id` | `number` | Run id. |
| `state` | `string` | Terminal state (or last seen on timeout). |
| `result` | `string \| null` | Final result. |
| `timedOut` | `boolean` | True when `--timeout` elapsed first. |

### PipelineLog / PipelineLogContent  (`logs`)
| Field | Type | Notes |
|-------|------|-------|
| `id` | `number` | Log id. |
| `createdOn` | `string \| null` | ISO timestamp. |
| `lineCount` | `number \| null` | Lines, when provided. |
| (content) | `string` | Returned by `--log-id`. |

### PipelineStartResult  (`start`)
| Field | Type | Notes |
|-------|------|-------|
| `id` | `number` | New run id (pipe into `wait`). |
| `state` | `string` | Initial state. |
| `webUrl` | `string \| null` | Link. |

---

## Exit-code contract (`wait`) — INV

- **INV-1**: `wait` exits `0` ⟺ run `result == 'succeeded'`.
- **INV-2**: `wait` exits non-zero for `failed`/`canceled` (distinct from
  success), and a dedicated non-zero (e.g. 124) when `--timeout` elapses before
  completion.
- **INV-3**: `--json` output of `wait` carries `state`, `result`, `timedOut`
  consistent with the exit code.

## Other invariants

- **INV-4**: `TestSummary.present == false` ⟹ the detail view shows "no tests
  present", never "0 failures".
- **INV-5**: Any of the three detail sources (core / timeline / tests) failing
  degrades that section to "unavailable" without failing the command.
- **INV-6**: Every subcommand serialises the same information under `--json` as
  it prints in human mode.
