# Implementation Plan: Better support for commenting in the pull request

**Branch**: `023-pr-comments-status` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/023-pr-comments-status/spec.md` · **Issue**: #50

## Summary

Three improvements to the `azdo pr` command surface:

1. **Fix `pr status` "no checks" defect (US1).** The command only reads the
   PR Status API (`/statuses`), which misses **branch policy evaluations** —
   the actual green checks shown in the ADO UI. Add a policy-evaluations
   fetch and merge it with statuses; distinguish "genuinely none" from
   "couldn't retrieve".
2. **Add comment filters to `pr comments` (US2).** New `--code-related-only`
   (file-anchored threads only) and `--exclude-resolved` (alias of the
   existing `--hide-resolved`). Independent, combinable, default off.
3. **Add code-comment counts to `pr status` (US3).** Fetch threads per PR and
   show open/closed counts of code-anchored threads.

The thread anchor (`threadContext.filePath`) and resolved-state mapping
(`isThreadResolved`) already exist; the bulk of new work is the
policy-evaluations source for US1.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: commander.js, native `fetch` (no new runtime deps)
**Storage**: N/A (stateless CLI; reads Azure DevOps REST)
**Testing**: vitest (unit tests under `tests/unit/`)
**Target Platform**: Node.js LTS CLI, bundled with tsup
**Project Type**: Single-project CLI
**Performance Goals**: Interactive CLI; +1 policy fetch and +1 threads fetch per listed PR (typically 0–1 PRs) — negligible
**Constraints**: No `any`; `--json` parity; no behavioural regression to existing flags
**Scale/Scope**: ~2 source files (`src/services/pr-client.ts`, `src/commands/pr.ts`), 1 types file, docs, unit tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance |
|-----------|------------|
| I. CLI-First Design | ✅ New flags are commander.js options; `--json` parity maintained (FR-010); meaningful output preserved. |
| II. TypeScript Strictness | ✅ New types (`source`, `codeCommentCounts`, policy-evaluation shapes) explicitly typed; no `any`; type guards on REST responses. |
| III. Single Responsibility | ✅ Data fetching stays in `pr-client.ts` service; formatting/filtering in `pr.ts` command; reuse `isThreadResolved`. No duplicated state logic. |
| IV. npm Distribution | ✅ No new runtime dependency; tsup bundle unaffected. |
| V. Simplicity | ✅ Reuse existing predicates/filters; `--exclude-resolved` is an alias, not a parallel path; one project-GUID lookup cached per command. No new abstractions. |

**Post-design re-check**: PASS — no new violations introduced; no Complexity
Tracking entries required.

**Workflow note**: Constitution requires `README.md` to be reviewed/updated
after the spec run (and `docs/commands.md`) — captured as a docs task.

## Project Structure

### Documentation (this feature)

```text
specs/023-pr-comments-status/
├── plan.md              # This file
├── spec.md              # Approved spec
├── research.md          # Phase 0 — R1..R6 decisions
├── data-model.md        # Phase 1 — extended types
├── quickstart.md        # Phase 1 — manual verification
├── contracts/
│   └── cli-commands.md  # Phase 1 — command surface
└── tasks.md             # Phase 2 (/speckit.tasks — not created here)
```

### Source Code (repository root)

```text
src/
├── commands/
│   └── pr.ts                 # status + comments commands: new flags, filters,
│                             #   counts, union checks rendering, empty-vs-error
├── services/
│   └── pr-client.ts          # getPullRequestChecks (merge policy evals),
│                             #   new getPullRequestPolicyEvaluations,
│                             #   resolveProjectId; reuse getPullRequestThreads
└── types/
    └── pull-request.ts       # PullRequestCheck.source, codeCommentCounts,
                              #   Azdo policy-evaluation response shapes

tests/
└── unit/
    ├── pr-comment-state.test.ts     # existing — extend for new filters
    ├── pr-status-checks.test.ts     # checks union + empty-vs-error (new/extended)
    └── pr-code-comment-counts.test.ts  # open/closed counting (new)

docs/
└── commands.md           # document new flags + status output
README.md                 # constitution-required review/update
```

**Structure Decision**: Single-project CLI (existing layout). Service layer
(`pr-client.ts`) owns all REST I/O and mapping; command layer (`pr.ts`) owns
flag parsing, filtering, counting, and rendering. This matches the current
separation and Principle III.

## Implementation approach (per concern)

### US1 — surface policy evaluations
- Add `resolveProjectId(context, cred)` to `pr-client.ts`: `GET
  _apis/projects/{project}` → `.id`; cache within the command invocation.
- Add `getPullRequestPolicyEvaluations(context, repo, cred, projectId, prId)`:
  `GET {project}/_apis/policy/evaluations?artifactId=vstfs:///CodeReview/CodeReviewId/{projectId}/{prId}`.
  Map evaluation → `PullRequestCheck` (state normalisation per data-model);
  drop `notApplicable`/`notSet`.
- In `pr status`, fetch both sources, merge (`source` tags origin), and pass
  the union to `formatPullRequestChecks`.
- Make the empty-vs-error branch explicit: only print "none reported" when
  both fetches succeed and the union is empty.

### US2 — comments filters
- `pr comments`: add `--code-related-only` (`codeRelatedOnly`) and
  `--exclude-resolved` (mapped to the same `hideResolved` as
  `--hide-resolved`). Apply `threadContext !== null` filter alongside the
  existing resolved filter; compose. Update empty-result messaging to name
  the active filter(s). Mirror in `--json`.

### US3 — counts in status
- `pr status`: per PR also call `getPullRequestThreads`, compute
  `codeCommentCounts = { open, closed }` over code-anchored threads via
  `isThreadResolved`, render a `Code comments:` line and add the field to
  JSON.

## Testing strategy (TDD)
- Unit tests drive each concern against fixture REST payloads (no live ADO):
  - checks union incl. policy evaluations + empty-vs-error (US1),
  - `--code-related-only`, `--exclude-resolved` alias, and combination (US2),
  - open/closed code-comment counting incl. general-thread exclusion (US3).
- Existing `pr-comment-state.test.ts` must stay green (regression / FR-006).
- `npm run lint && npm test && npm run build` all clean before ready.

## Complexity Tracking

No constitution violations — section intentionally empty.
