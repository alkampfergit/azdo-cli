# Implementation Plan: PR Work Item Links, Reviewer Management, and Template-Aware Creation

**Branch**: `034-pr-link-review` | **Date**: 2026-08-21 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/034-pr-link-review/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Add three previously-missing `azdo pr` capabilities: linking/unlinking a
work item to a pull request, adding/removing required-or-optional
reviewers, and making `pr open` use a repository-defined pull request
template (Azure DevOps's own branch-specific / default template
convention) when no `--description` is supplied. All three are new
thin command + service-layer functions over existing Azure DevOps REST
endpoints, following the exact patterns already used by `pr comments`
and `pr open` — no new dependencies, no new storage.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode) — unchanged
**Primary Dependencies**: commander.js, native `fetch` (via existing `fetchWithErrors`/`authHeaders`) — no new dependencies
**Storage**: N/A (all state lives in Azure DevOps)
**Testing**: vitest — unit tests per new service function + command, extending the existing `tests/unit/pr-command-tree.test.ts` real-command-tree coverage
**Target Platform**: Node.js LTS, cross-platform CLI (existing)
**Project Type**: CLI (single project — Option 1 below)
**Performance Goals**: none beyond existing `pr` command precedent (interactive single-operator CLI calls, not a service)
**Constraints**: must preserve the existing exit-code contract (0/1/3/4) and `--json` shape conventions documented in `docs/commands.md`
**Scale/Scope**: single pull request / single work item / single reviewer per invocation, matching every existing `pr` write command

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
| --- | --- | --- |
| I. CLI-First Design | Four new subcommands (`pr work-items link/unlink`, `pr reviewers add/remove`) via commander.js; `--json` on every write; meaningful exit codes reusing `EXIT_NOT_FOUND`/`EXIT_NOT_PERMITTED` | PASS |
| II. TypeScript Strictness | New types added to `src/types/pull-request.ts` alongside existing ones; no `any` | PASS |
| III. Single Responsibility Commands | Link/unlink, add/remove reviewer, and template resolution are each a single focused operation; no combined command | PASS |
| IV. npm Distribution | No new runtime dependency; existing tsup bundle unaffected | PASS |
| V. Simplicity | Reuses existing `resolvePullRequestTarget`, `fetchWithErrors`, `handlePrCommandError`; no new abstraction layer | PASS |
| VI. Azure DevOps API Research | Microsoft Learn MCP consulted for reviewers, work item relations, and PR template conventions before any code was proposed — see [research.md](research.md) | PASS |

No violations — Complexity Tracking section left empty.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── commands/
│   └── pr.ts                # add work-items/reviewers subcommands; extend `open`
├── services/
│   └── pr-client.ts          # add reviewer, work-item-link, and template-lookup calls
└── types/
    └── pull-request.ts       # add Reviewer / WorkItemLink / PullRequestTemplate types

tests/
├── unit/
│   ├── pr-command-tree.test.ts   # extend with the new subcommands (existing real-tree suite)
│   └── pr-client.test.ts         # new unit coverage per new service function
└── integration/
    └── pr.integration.test.ts    # extend with reviewer/work-item/template round-trips
```

**Structure Decision**: Single project (existing `src/` + `tests/`
layout). No new top-level directories — every change lands in the three
files that already own the `pr` command surface, matching how prior
`pr` features (comments, list, status) were added.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

None — no violations.
