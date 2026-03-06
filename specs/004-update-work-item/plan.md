# Implementation Plan: Update Work Item

**Branch**: `004-update-work-item` | **Date**: 2026-03-06 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/004-update-work-item/spec.md`

## Summary

Add three CLI commands (`set-state`, `assign`, `set-field`) to update Azure DevOps work items via the REST API PATCH endpoint with JSON Patch operations. All commands share a common `updateWorkItem` service function and follow the same patterns (auth, context resolution, error handling) as the existing `get-item` command.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: commander.js (CLI framework), @napi-rs/keyring (credential store) - both existing
**Storage**: N/A (no local storage; updates go to Azure DevOps API)
**Testing**: vitest (existing test framework)
**Target Platform**: Node.js LTS (18+), cross-platform
**Project Type**: CLI tool
**Performance Goals**: N/A (single user, single request per command)
**Constraints**: PAT must have "Work Items (Read & Write)" scope
**Scale/Scope**: 3 new commands, 1 new service function, 1 new type

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. CLI-First Design | PASS | All features are commander.js commands with POSIX conventions. `--json` flag supported on all commands. Exit code 0/1. |
| II. TypeScript Strictness | PASS | All new code uses strict mode, explicit types, no `any`. |
| III. Single Responsibility | PASS | Each command does one thing. Shared HTTP logic in `azdo-client.ts` service. |
| IV. npm Distribution | PASS | No new runtime dependencies. Uses existing `fetch` and `commander.js`. |
| V. Simplicity | PASS | Minimal implementation: one shared `updateWorkItem` function, three thin command modules. No abstractions beyond what's needed. |

**Post-Phase 1 Re-check**: All gates still pass. The design adds no new dependencies, no abstractions, and follows existing patterns exactly.

## Project Structure

### Documentation (this feature)

```text
specs/004-update-work-item/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── cli-commands.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── commands/
│   ├── set-state.ts      # NEW - set-state command
│   ├── assign.ts         # NEW - assign command
│   └── set-field.ts      # NEW - set-field command
├── services/
│   └── azdo-client.ts    # MODIFIED - add updateWorkItem function
├── types/
│   └── work-item.ts      # MODIFIED - add UpdateResult, JsonPatchOperation types
└── index.ts              # MODIFIED - register three new commands

tests/
└── unit/
    ├── set-state.test.ts   # NEW
    ├── assign.test.ts      # NEW
    └── set-field.test.ts   # NEW
```

**Structure Decision**: Follows existing flat structure. Each command is a single file under `src/commands/`. Shared update logic added to the existing `azdo-client.ts` service rather than creating a new file.
