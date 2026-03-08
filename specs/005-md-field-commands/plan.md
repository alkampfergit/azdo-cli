# Implementation Plan: Markdown Field Commands

**Branch**: `005-md-field-commands` | **Date**: 2026-03-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-md-field-commands/spec.md`

## Summary

Add two new top-level CLI commands — `get-md-field` and `set-md-field` — for reading and writing markdown content in Azure DevOps work item fields. `get-md-field` retrieves a field value, detects whether it's HTML or markdown, and converts HTML to markdown before outputting. `set-md-field` accepts markdown content via inline argument, file, or stdin, and sends it to Azure DevOps with the `multilineFieldsFormat` flag to enable native markdown rendering. Uses `node-html-markdown` (zero-dependency, native TypeScript) for HTML-to-markdown conversion.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode) on Node.js LTS
**Primary Dependencies**: commander.js (CLI framework), node-html-markdown (HTML→MD conversion, zero deps, native TS)
**Storage**: N/A (reads/writes to Azure DevOps API)
**Testing**: vitest
**Target Platform**: Node.js LTS (cross-platform CLI)
**Project Type**: CLI tool (npm-distributed)
**Performance Goals**: N/A (single-request CLI commands)
**Constraints**: Minimal runtime dependencies (Constitution IV); tsup bundling
**Scale/Scope**: Two new commands, one new runtime dependency, two new service modules

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Check

| Principle | Status | Notes |
| --------- | ------ | ----- |
| I. CLI-First Design | PASS | Both commands are top-level commander.js commands with clear args/options. Output to stdout, errors to stderr. `get-md-field` outputs raw markdown (no `--json` per clarification — user explicitly chose this, justified by piping workflow). `set-md-field` supports both human-readable confirmation and `--json` output, consistent with existing `set-field` command. |
| II. TypeScript Strictness | PASS | All new code will use strict mode, explicit types, no `any`. `node-html-markdown` has native TypeScript types. |
| III. Single Responsibility | PASS | Each command does one thing: `get-md-field` reads+converts, `set-md-field` writes. Shared logic (HTML detection, context resolution) extracted to services. |
| IV. npm Distribution | PASS | `node-html-markdown` has zero dependencies — ideal for tsup bundling. Minimal impact on bundle size (~113 kB unpacked). |
| V. Simplicity | PASS | No abstractions beyond what's needed. Two commands, two small service modules. Flat structure under `src/`. |

**Note on Principle I (`--json` flag)**: The constitution states commands "MUST support both human-readable and JSON output formats via a `--json` flag where applicable." For `get-md-field`, the user explicitly chose raw markdown output only (Clarification Q3). This is justified because the command's primary purpose is to output markdown for piping/saving — a JSON envelope would break that workflow. The "where applicable" qualifier covers this exception. `set-md-field` fully supports `--json` consistent with the existing `set-field` command.

### Post-Design Check

| Principle | Status | Notes |
| --------- | ------ | ----- |
| I. CLI-First Design | PASS | Command contracts defined with POSIX conventions. Exit codes: 0/1. |
| II. TypeScript Strictness | PASS | Data model uses typed interfaces. No `any`. |
| III. Single Responsibility | PASS | `html-detect.ts` and `md-convert.ts` are focused service modules. |
| IV. npm Distribution | PASS | Single new runtime dep with zero transitive deps. |
| V. Simplicity | PASS | No unnecessary abstractions. Content source resolution is a simple precedence chain, not a strategy pattern. |

## Project Structure

### Documentation (this feature)

```text
specs/005-md-field-commands/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research findings
├── data-model.md        # Phase 1 data model
├── quickstart.md        # Phase 1 quickstart guide
├── contracts/
│   └── cli-commands.md  # CLI command contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── commands/
│   ├── get-md-field.ts     # NEW: get-md-field command
│   └── set-md-field.ts     # NEW: set-md-field command
├── services/
│   ├── context.ts          # NEW: shared resolveContext (extracted from set-field.ts)
│   ├── html-detect.ts      # NEW: HTML detection heuristic
│   ├── md-convert.ts       # NEW: HTML-to-markdown conversion wrapper
│   ├── azdo-client.ts      # MODIFIED: add getWorkItemFieldValue() for single-field retrieval
│   └── ...                 # existing services unchanged
└── index.ts                # MODIFIED: register new commands
```

**Structure Decision**: Follows existing flat structure under `src/commands/` and `src/services/`. No new directories needed. `resolveContext` extracted to shared service per Constitution Principle III.

## Complexity Tracking

No constitution violations to justify. All gates pass.
