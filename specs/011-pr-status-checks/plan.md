# Implementation Plan: Pull Request Status Checks

**Branch**: `011-pr-status-checks` | **Date**: 2026-03-31 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-pr-status-checks/spec.md`

## Summary

Extend `azdo pr status` so each returned pull request also includes Azure DevOps pull request status checks from the Git statuses API. The implementation will add a dedicated `getPullRequestChecks()` lookup in `pr-client.ts`, enrich the status-command result shape with a `checks` array, and update text plus JSON output so failed or errored checks surface Azure DevOps detail text when available.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode) on Node.js LTS  
**Primary Dependencies**: commander.js, native `fetch`, existing auth/context helpers, `node:child_process` git helpers  
**Storage**: N/A (reads Azure DevOps Git APIs only)  
**Testing**: vitest  
**Target Platform**: Node.js LTS, cross-platform CLI  
**Project Type**: npm-distributed CLI tool  
**Performance Goals**: One pull request list request plus one status-check request per returned pull request; no extra interactive prompts  
**Constraints**: No new runtime dependencies; preserve existing `pr status` no-results and error behavior; keep `pr open` and `pr comments` on their existing lighter-weight lookup path; keep JSON backward-compatible except for the additive `checks` field  
**Scale/Scope**: One existing command path, one existing PR service, one existing PR type module, unit tests, and README updates

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Check

| Principle | Status | Notes |
| --------- | ------ | ----- |
| I. CLI-First Design | PASS | The feature extends an existing commander subcommand and keeps stdout/stderr plus `--json` behavior. |
| II. TypeScript Strictness | PASS | The design adds explicit interfaces for Azure DevOps status records and mapped check entities. |
| III. Single Responsibility Commands | PASS | `pr status` remains a read-only discovery command, now with richer read output. |
| IV. npm Distribution | PASS | No new dependencies or build changes are required. |
| V. Simplicity | PASS | The change stays within the existing PR client instead of adding a parallel abstraction. |

### Post-Design Check

| Principle | Status | Notes |
| --------- | ------ | ----- |
| I. CLI-First Design | PASS | The extended output remains scriptable and human-readable without changing the invocation shape. |
| II. TypeScript Strictness | PASS | The mapped check shape and Azure DevOps response interfaces remain explicit and narrow. |
| III. Single Responsibility Commands | PASS | The command still reports PR status; checks are part of that status rather than a separate workflow. |
| IV. npm Distribution | PASS | Uses only the current toolchain and runtime dependencies. |
| V. Simplicity | PASS | One additive `checks` field and one additional service call path are sufficient. |

## Project Structure

### Documentation (this feature)

```text
specs/011-pr-status-checks/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── cli-contract.md
├── spec.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── commands/
│   └── pr.ts                # EXTEND — include check rendering in pr status
├── services/
│   └── pr-client.ts         # EXTEND — fetch and map Azure DevOps PR status checks
├── types/
│   └── pull-request.ts      # EXTEND — add PR check response and result types
└── index.ts                 # unchanged

tests/
└── unit/
    ├── pr-client.test.ts    # EXTEND — status check mapping and filtering
    └── pr-status.test.ts    # EXTEND — text and JSON output with checks

README.md                    # EXTEND — document pr status checks output
```

**Structure Decision**: Keep the feature inside the existing pull request command, service, and type modules. The request is an additive `pr status` enhancement, so deeper module splitting would add indirection without value.

## Phase 0: Research

All open questions were resolved in [research.md](./research.md).

Key decisions:

- Use the Azure DevOps Git pull request statuses API for check retrieval
- Model checks as an additive `checks` array on each returned pull request
- Filter `notApplicable` and `notSet` from default output
- Surface error detail from the Azure DevOps status `description` field

## Phase 1: Design & Contracts

See [data-model.md](./data-model.md), [quickstart.md](./quickstart.md), and [contracts/cli-contract.md](./contracts/cli-contract.md).

### `src/types/pull-request.ts` additions

Add:

```typescript
export interface PullRequestCheck {
  id: number;
  state: string;
  name: string;
  description: string | null;
  targetUrl: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}
```

Add a status-command-only pull request type:

```typescript
export interface PullRequestStatusPullRequest extends BranchPullRequestMatch {
  checks: PullRequestCheck[];
}
```

Add minimal Azure DevOps response interfaces for the pull request statuses endpoint.

### `src/services/pr-client.ts`

Add a `getPullRequestChecks()` helper that retrieves checks for one pull request and maps them into `PullRequestCheck[]`.

Key behavior:

- Request `GET .../pullRequests/{pullRequestId}/statuses?api-version=7.1`
- Map context into a stable display name
- Filter out `notApplicable` and `notSet`
- Preserve `description` as returned

### `src/commands/pr.ts`

Extend `pr status` so it resolves base pull requests with `listPullRequests()`, then enriches each result with `getPullRequestChecks()`. Update `formatPullRequestBlock()` so it renders checks below each pull request.

Text behavior:

- `Checks: none reported by Azure DevOps` when a PR has no checks
- One line per check for normal output
- Extra `Detail:` line when a check is `failed` or `error` and `description` exists

JSON behavior:

- Preserve the existing top-level shape
- Include the additive `checks` field under each pull request object

## Implementation Order

1. Extend `tests/unit/pr-client.test.ts` with failing status-check retrieval and filtering coverage.
2. Extend `tests/unit/pr-status.test.ts` with failing text and JSON assertions for checks.
3. Extend `src/types/pull-request.ts` with check interfaces.
4. Extend `src/services/pr-client.ts` to fetch and map checks.
5. Extend `src/commands/pr.ts` formatting and result handling.
6. Update `README.md`.
7. Run `npm test && npm run lint`.

## Test Strategy

- Extend `tests/unit/pr-client.test.ts` to cover:
  - pull request statuses fetch and mapping
  - `notApplicable` and `notSet` filtering
  - fallback naming when context fields are missing
- Extend `tests/unit/pr-status.test.ts` to cover:
  - text output with check list
  - empty-check message
  - failed/error detail rendering
  - JSON output with `checks`
- Re-run the existing PR command tests to guard against regressions.

## Complexity Tracking

No constitution violations to justify. All gates pass.
