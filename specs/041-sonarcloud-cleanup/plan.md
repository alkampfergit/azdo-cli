# Implementation Plan: SonarCloud clean sweep

**Branch**: `feature/041-sonarcloud-cleanup` | **Date**: 2026-09-18 | **Spec**: [spec.md](./spec.md)

## Summary

Resolve all 35 OPEN/CONFIRMED SonarCloud findings on `develop` with source
changes only. Three of them are real refactors of shipped command code
(cognitive complexity 46 / 18 / 17 → under 15); the remaining 32 are
one-to-a-few-line edits across CI config, shell scripts, types and tests. No
CLI surface change, no dependency change, no rule suppressions.

## Technical Context

**Language/Version**: TypeScript 5.x (strict) on Node.js LTS; bash for the
scripts; GitHub Actions YAML for the workflow.
**Primary Dependencies**: unchanged — commander.js, native `fetch`,
`@napi-rs/keyring`, vitest.
**Storage**: N/A.
**Testing**: vitest (`npm test`), ESLint (`npm run lint`), `npm run typecheck`.
**Target Platform**: Linux/macOS/Windows CLI.
**Project Type**: single project (`src/` + `tests/`).
**Performance Goals**: N/A.
**Constraints**: byte-identical command output (FR-002); zero new findings
(SC-004).
**Scale/Scope**: 15 files, 35 findings.

## Constitution Check

| Principle | Status |
|---|---|
| I. CLI-First Design | No command surface touched. The `pr comments` refactor keeps every option and every message. |
| II. TypeScript Strictness | No `any` introduced. `stringifyValue` in `list-fields.ts` gets *more* explicit narrowing, not less. |
| III. Single Responsibility Commands | Improved: the 46-complexity `pr comments` action is split into named helpers, each with one job. |
| IV. npm Distribution | Unchanged. `--ignore-scripts` affects CI install only, never the published package. |
| V. Simplicity | Extraction only. No new abstraction layer, no wrapper, no indirection beyond a module-private function per extracted concern. |
| VI. Azure DevOps API Research | Not applicable — no ADO REST API surface is added or changed by any of the 35 fixes. |

No violations; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/041-sonarcloud-cleanup/
├── spec.md
├── plan.md          # this file
├── research.md
├── tasks.md
└── pr-report.md
```

### Source Code (repository root)

```text
.devcontainer/postcreate.sh                    # 7 findings
.github/workflows/ci.yml                       # 7 findings
.specify/scripts/bash/update-agent-context.sh  # 2 findings
scripts/compute-version.sh                     # 5 findings
src/commands/auth.ts                           # handleLogout split
src/commands/list-fields.ts                    # stringifyValue narrowing
src/commands/pr.ts                             # pr comments action split; .some()
src/commands/relations.ts                      # ?? over ternary
src/services/auth.ts                           # findDotEnvPat split; re-export
src/types/relations.ts                         # usage: string
tests/integration/auth.integration.test.ts     # literal it(), ctx.skip()
tests/integration/helpers/skip-unless-integration.ts
tests/integration/md-generic-types.test.ts     # it.each
tests/unit/auth.test.ts                        # toHaveLength
tests/unit/git-remote.test.ts                  # it.each ×2
tests/unit/trace-writer.test.ts                # add assertion
docs/                                          # no user-visible change → no doc edit
```

**Structure Decision**: Existing layout, unchanged. This feature adds no file
to `src/`; every extracted helper is module-private next to its caller,
following the precedent set by 039 (`parseTargetPrNumber` / `fetchTargetById`
/ `findBranchPullRequest`) and 038 (`resolveOpenDescription` /
`resolveRequestedFields` / `diffRequestedFields`).

## Refactor designs (the only non-trivial part)

### R-1: `pr.ts` — the `pr comments` action (46 → target < 15)

Current shape: one `.action()` doing option parsing, PR resolution, thread
fetching, thread selection, thread filtering, and two output modes. Split into:

- `parseCommentsOptions(options)` → `{ prId, maxChars, threadFilter } | null`.
  Owns the three `writeError` + `return` validation branches; `null` means the
  error is already on stderr.
- `resolveCommentsPullRequest(resolved, explicitPrId)` →
  `{ pullRequest, branchLabel } | null`. Owns the by-id vs by-branch fork,
  including the zero-match / multi-match contract errors.
- `selectCommentThreads(fetchedThreads, threadFilter, prId)` →
  `CommentThread[] | null`. Owns the `--thread` selector-not-filter error.
- `describeEmptyThreads(prId, allThreadCount, filters)` → the "no ... comment
  threads" sentence, including the filter-name join.

The action keeps the `try`/`catch` and the happy-path sequencing. Every string
literal moves verbatim.

### R-2: `commands/auth.ts` — `handleLogout` (18 → target < 15)

Split on the flag it already branches on: `logoutAllOrgs()` and
`logoutSingleOrg(orgFromGlobal)`. `handleLogout` keeps only the
mutually-exclusive-flags guard and the dispatch.

### R-3: `services/auth.ts` — `findDotEnvPat` (17 → target < 15)

The nesting is `while` → `if exists` → `for line` → `if match` → `if non-empty`,
which is exactly what the metric punishes. Extract
`patFromEnvFile(path): string | null` (the inner three levels); the walk-up
loop keeps only "read this directory, else step to the parent, stop at root".

## Verification

1. `npm test && npm run lint` locally.
2. Push; CI green on `build`, `integration-tests`, `publish`.
3. Re-query the SonarCloud issues API for `develop` after merge → 0.
4. SonarCloud PR analysis → 0 new findings (SC-004).

## Complexity Tracking

None.
