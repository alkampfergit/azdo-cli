# Implementation Plan: Get Work Item Command

**Branch**: `002-get-item-command` | **Date**: 2026-03-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-get-item-command/spec.md`

## Summary

Add a `get-item` command to the azdo CLI that retrieves and displays an Azure DevOps work item by ID. Authentication uses a PAT resolved from environment variable, Windows Credential Manager, or interactive prompt. Organization and project can be specified explicitly or auto-detected from git remote URLs.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode) on Node.js LTS (18+)
**Primary Dependencies**: commander.js (existing), @napi-rs/keyring (new - Windows Credential Manager)
**Storage**: Windows Credential Manager via @napi-rs/keyring for PAT persistence
**Testing**: vitest (existing)
**Target Platform**: Windows (initial), Node.js 18+ (built-in fetch)
**Project Type**: CLI tool
**Performance Goals**: Work item retrieval in under 5 seconds end-to-end
**Constraints**: Minimal runtime dependencies per constitution; no `any` types; POSIX conventions
**Scale/Scope**: Single command, single work item retrieval

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. CLI-First Design | PASS | Command exposed via commander.js with clear args/options. stdout for output, stderr for errors. Exit codes: 0 success, 1 error. `--json` deferred to future feature per spec. |
| II. TypeScript Strictness | PASS | strict: true already configured. No `any` usage planned. All public APIs will have explicit types. |
| III. Single Responsibility | PASS | `get-item` does one thing: retrieve and display a work item. Shared logic (auth, git remote parsing) extracted to service modules. |
| IV. npm Distribution | PASS | @napi-rs/keyring ships prebuilt binaries, no node-gyp needed. Will be a runtime dependency. tsup bundling unchanged. |
| V. Simplicity | PASS | Direct fetch() to REST API (no SDK). PAT via env var or credential manager (no config files). Flat module structure. |

**Gate result: PASS** - No violations.

## Project Structure

### Documentation (this feature)

```text
specs/002-get-item-command/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── cli-contract.md  # Command schema
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── index.ts                  # CLI entry point (existing, add get-item command registration)
├── version.ts                # Version helper (existing)
├── commands/
│   └── get-item.ts           # get-item command definition and handler
├── services/
│   ├── azdo-client.ts        # Azure DevOps REST API client (fetch-based)
│   ├── auth.ts               # PAT resolution (env → credential manager → prompt)
│   ├── git-remote.ts         # Git remote URL parsing for org/project extraction
│   └── credential-store.ts   # Windows Credential Manager wrapper (@napi-rs/keyring)
└── types/
    └── work-item.ts          # Work item type definitions

tests/
├── unit/
│   ├── cli.test.ts           # Existing CLI tests
│   ├── git-remote.test.ts    # URL parsing tests
│   ├── auth.test.ts          # PAT resolution logic tests
│   └── work-item.test.ts     # Output formatting tests
└── contract/
    └── get-item.test.ts      # CLI contract tests (args, flags, exit codes)
```

**Structure Decision**: Single project layout following existing `src/` and `tests/` convention. New `commands/`, `services/`, and `types/` directories under `src/` keep modules flat and single-responsibility per constitution.
