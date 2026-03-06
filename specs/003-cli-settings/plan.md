# Implementation Plan: CLI Settings

**Branch**: `003-cli-settings` | **Date**: 2026-03-05 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/003-cli-settings/spec.md`

## Summary

Add persistent CLI settings (`org`, `project`, `fields`) stored in `~/.azdo/config.json`. Provide a `config` command group (`set`/`get`/`list`/`unset`) for managing settings. Integrate saved defaults into `get-item`'s context resolution chain and support additional work item fields in output.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: commander.js (CLI framework, existing), node:fs and node:path (config file I/O, built-in)
**Storage**: JSON file at `~/.azdo/config.json` via `node:fs`
**Testing**: vitest (existing)
**Target Platform**: Node.js LTS (18+), cross-platform (Linux, macOS, Windows)
**Project Type**: CLI tool
**Performance Goals**: Config operations complete in under 3 seconds (per SC-001)
**Constraints**: Zero new runtime dependencies (per constitution principle IV)
**Scale/Scope**: 3 setting keys (`org`, `project`, `fields`), 4 subcommands, 1 modified command

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Research Check

| Principle | Status | Notes |
| --------- | ------ | ----- |
| I. CLI-First Design | PASS | `config` command group with subcommands via commander.js. `--json` flag supported on all subcommands. Meaningful exit codes. |
| II. TypeScript Strictness | PASS | strict: true, no `any`, explicit types on all exports. |
| III. Single Responsibility | PASS | Config commands are independent. Shared config logic in `src/services/config-store.ts`. |
| IV. npm Distribution | PASS | Zero new runtime dependencies. Uses only `node:fs` and `node:path` (built-in). |
| V. Simplicity | JUSTIFIED | Constitution says "no config files unless user scenarios demand it." This feature's explicit purpose is persistent settings - user scenarios demand it. Minimal implementation: single JSON file, 3 keys, no schema library. |

### Post-Design Check

| Principle | Status | Notes |
| --------- | ------ | ----- |
| I. CLI-First Design | PASS | All 4 subcommands support `--json`. Output to stdout, errors to stderr. Exit codes 0/1. |
| II. TypeScript Strictness | PASS | `CliConfig` interface with explicit types. Config store functions fully typed. |
| III. Single Responsibility | PASS | `config-store.ts` handles persistence. Commands delegate to it. `get-item` uses config as one resolution source. |
| IV. npm Distribution | PASS | No new dependencies added. |
| V. Simplicity | PASS | Single JSON file, synchronous I/O for config (not perf-critical), flat module structure. |

## Project Structure

### Documentation (this feature)

```text
specs/003-cli-settings/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── cli-contract.md  # Phase 1 output
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── commands/
│   ├── config.ts          # NEW: config command group (set/get/list/unset)
│   ├── get-item.ts        # MODIFIED: add --fields option, config fallback for org/project
│   └── clear-pat.ts       # UNCHANGED
├── services/
│   ├── config-store.ts    # NEW: read/write ~/.azdo/config.json
│   ├── azdo-client.ts     # MODIFIED: accept additional fields parameter
│   ├── auth.ts            # UNCHANGED
│   ├── credential-store.ts # UNCHANGED
│   └── git-remote.ts      # UNCHANGED
├── types/
│   └── work-item.ts       # MODIFIED: add CliConfig interface, extend WorkItem with extraFields
├── index.ts               # MODIFIED: register config command
└── version.ts             # UNCHANGED

tests/
└── unit/
    ├── config-store.test.ts  # NEW: config read/write/validation tests
    ├── config-commands.test.ts # NEW: config subcommand tests
    └── ...                    # UNCHANGED existing tests
```

**Structure Decision**: Follows existing flat structure under `src/commands/` and `src/services/`. New `config-store.ts` service parallels existing `credential-store.ts`. New `config.ts` command file follows the pattern of `get-item.ts` and `clear-pat.ts`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
| Config file (Principle V) | User scenarios explicitly demand persistent settings for default org/project/fields | Env vars alone cannot persist across sessions without user shell configuration; CLI flags alone don't reduce repetition |
